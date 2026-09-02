import { Injectable, Logger } from '@nestjs/common';
import { EncryptionService } from '../../common/services/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { GRAPH_API_VERSION } from '../social-channels/social-channels.service';
import { ProspectsService } from './prospects.service';

const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const GRAPH_TIMEOUT_MS = 8000;
/** `field_data`/`created_time` vienen siempre; el resto se pide explícito —
 *  la Graph API no los devuelve por default en `GET /{leadgen_id}`. */
const LEAD_FIELDS = 'ad_id,ad_name,campaign_id,campaign_name,form_id,field_data,created_time';

interface MetaLeadFieldDatum {
  name: string;
  values?: string[];
}

interface MetaLeadDetails {
  id: string;
  ad_id?: string;
  ad_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  field_data?: MetaLeadFieldDatum[];
}

interface GraphErrorBody {
  error?: { message?: string };
}

/**
 * Módulo 11 — Prospectos, Fase 2 (Task 2.2). Consulta la Graph API de Meta
 * para resolver un evento `leadgen` (que solo trae un ID) a los datos reales
 * del formulario, y se los entrega a `ProspectsService.upsertFromLead`.
 *
 * Solo cubre Meta (Facebook Lead Ads) — TikTok Lead Ads (RF-1 también lo
 * menciona) requiere su propio flujo de conexión/token, que Integraciones
 * (Feature 10) todavía no implementó, así que no hay de dónde sacar un
 * `SocialChannel` de TikTok para esto todavía.
 */
@Injectable()
export class MetaLeadProcessorService {
  private readonly logger = new Logger(MetaLeadProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly prospects: ProspectsService,
  ) {}

  /**
   * Se dispara desde `MetaWebhooksController` SIN `await` (Task 2.3): la
   * respuesta al webhook debe salir en <200ms (spec §4) y esta consulta a la
   * Graph API puede tardar más. Por eso nunca relanza: cualquier error queda
   * solo en el log — Meta ya recibió su 200 y no hay a quién devolvérselo.
   */
  async processLeadgenEvent(pageId: string, leadgenId: string): Promise<void> {
    try {
      const channel = await this.prisma.socialChannel.findFirst({
        where: { externalId: pageId, provider: 'META_FACEBOOK' },
      });
      if (!channel) {
        this.logger.warn(
          `Webhook leadgen de la Página ${pageId}, pero no hay ningún SocialChannel conectado para ella — se descarta.`,
        );
        return;
      }

      const pageAccessToken = this.encryption.decrypt(channel.accessToken);
      const lead = await this.fetchLeadDetails(leadgenId, pageAccessToken);
      const mapped = mapLeadFields(lead.field_data ?? []);

      if (!mapped.phone) {
        this.logger.warn(
          `Lead ${leadgenId} de la Página ${pageId} no trae teléfono — se descarta (Prospect.phone es obligatorio).`,
        );
        return;
      }

      await this.prospects.upsertFromLead(channel.tenantId, {
        channelId: channel.id,
        fullName: mapped.fullName,
        phone: mapped.phone,
        email: mapped.email,
        sourceProvider: 'META_FACEBOOK',
        campaignName: lead.campaign_name ?? null,
        adName: lead.ad_name ?? null,
        formAnswers: mapped.answers,
      });

      this.logger.log(`Lead ${leadgenId} (Página ${pageId}) ingresado como prospecto del tenant ${channel.tenantId}.`);
    } catch (error) {
      this.logger.error(`No se pudo procesar el lead ${leadgenId} de la Página ${pageId}: ${String(error)}`);
    }
  }

  private async fetchLeadDetails(leadgenId: string, accessToken: string): Promise<MetaLeadDetails> {
    const url = new URL(`${GRAPH_BASE_URL}/${leadgenId}`);
    url.searchParams.set('fields', LEAD_FIELDS);
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url, { signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) });
    const body = (await response.json()) as MetaLeadDetails & GraphErrorBody;
    if (!response.ok || body.error) {
      throw new Error(body.error?.message ?? `Graph API respondió ${response.status} al consultar el lead ${leadgenId}.`);
    }
    return body;
  }
}

// Nombres de campo estándar que Meta usa en la mayoría de formularios de
// Lead Ads — cualquier otro campo ("¿qué tratamiento te interesa?", edad,
// distrito, etc.) cae en `answers` tal cual, para el drawer de detalle
// (Fase 3) en vez de perderse.
const FULL_NAME_KEYS = ['full_name', 'name'];
const FIRST_NAME_KEYS = ['first_name'];
const LAST_NAME_KEYS = ['last_name'];
const PHONE_KEYS = ['phone_number', 'phone'];
const EMAIL_KEYS = ['email'];

function mapLeadFields(fields: MetaLeadFieldDatum[]): {
  fullName: string;
  phone: string | null;
  email: string | null;
  answers: Record<string, string>;
} {
  let fullName: string | undefined;
  let firstName: string | undefined;
  let lastName: string | undefined;
  let phone: string | undefined;
  let email: string | undefined;
  const answers: Record<string, string> = {};

  for (const field of fields) {
    const value = field.values?.[0] ?? '';
    const key = field.name.toLowerCase();
    if (FULL_NAME_KEYS.includes(key)) fullName = value;
    else if (FIRST_NAME_KEYS.includes(key)) firstName = value;
    else if (LAST_NAME_KEYS.includes(key)) lastName = value;
    else if (PHONE_KEYS.includes(key)) phone = value;
    else if (EMAIL_KEYS.includes(key)) email = value;
    else answers[field.name] = value;
  }

  return {
    fullName: fullName || [firstName, lastName].filter(Boolean).join(' ') || 'Prospecto sin nombre',
    phone: phone ?? null,
    email: email ?? null,
    answers,
  };
}
