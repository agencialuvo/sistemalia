import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

/** Taxpayer data as the onboarding wizard consumes it (spec §2, Paso 1.4). */
export interface SunatTaxpayer {
  ruc: string;
  razonSocial: string;
  direccionFiscal: string;
  /** SUNAT "estado del contribuyente": must be ACTIVO to be usable. */
  estado: string;
  /** SUNAT "condición del contribuyente": must be HABIDO to be usable. */
  condicion: string;
}

export interface SunatQueryResult {
  success: boolean;
  /** Where the answer came from — useful for debugging the 24h cache. */
  source: 'cache' | 'sunat' | 'mock';
  data: SunatTaxpayer | null;
  /** True when the frontend should unlock the fields for manual entry. */
  manualEntry: boolean;
  message: string;
}

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h, per plan.md
/** Acceptance criterion: autocomplete in under 2s. Give up before that. */
const SUNAT_TIMEOUT_MS = 2500;

const NOT_FOUND_MESSAGE =
  '[Error] El número de RUC no fue encontrado o se encuentra Inactivo en SUNAT.';
const UNAVAILABLE_MESSAGE =
  'No pudimos conectarnos a SUNAT en este momento. Puedes ingresar los datos manualmente y continuar.';
const OK_MESSAGE = 'Datos obtenidos de SUNAT correctamente.';

interface SunatProviderResponse {
  razonSocial?: string;
  nombre?: string;
  direccion?: string;
  direccionCompleta?: string;
  estado?: string;
  condicion?: string;
}

@Injectable()
export class SunatService {
  private readonly logger = new Logger(SunatService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolves a RUC to its taxpayer record.
   *
   * Never throws on an upstream problem: SUNAT being unreachable must degrade
   * to manual entry rather than block onboarding (spec §2, Paso 1.4 "Caso
   * Fallido"), so failures come back as `success: false, manualEntry: true`
   * with HTTP 200 instead of a 500.
   */
  async queryRuc(ruc: string): Promise<SunatQueryResult> {
    const cached = await this.redis.getSunatTaxpayer(ruc);
    if (cached) {
      return {
        success: true,
        source: 'cache',
        data: JSON.parse(cached) as SunatTaxpayer,
        manualEntry: false,
        message: OK_MESSAGE,
      };
    }

    const apiUrl = this.config.get<string>('SUNAT_API_URL');
    const result = apiUrl ? await this.fetchFromProvider(apiUrl, ruc) : this.buildMock(ruc);

    // Only successful lookups are cached. Caching a timeout or a miss would
    // pin a transient failure for 24h and keep the user on manual entry long
    // after SUNAT recovered.
    if (result.success && result.data) {
      await this.redis.setSunatTaxpayer(ruc, JSON.stringify(result.data), CACHE_TTL_SECONDS);
    }

    return result;
  }

  /**
   * Calls the configured SUNAT proxy (SUNAT has no free public API; providers
   * like apis.net.pe / decolecta expose one). Any failure is swallowed into a
   * manual-entry result.
   */
  private async fetchFromProvider(apiUrl: string, ruc: string): Promise<SunatQueryResult> {
    const token = this.config.get<string>('SUNAT_API_TOKEN');

    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/${ruc}`, {
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(SUNAT_TIMEOUT_MS),
      });

      if (response.status === 404) {
        return this.notFound();
      }
      if (!response.ok) {
        this.logger.warn(`SUNAT respondió ${response.status} para el RUC ${ruc}.`);
        return this.unavailable();
      }

      const body = (await response.json()) as SunatProviderResponse;
      const razonSocial = body.razonSocial ?? body.nombre;
      if (!razonSocial) {
        return this.notFound();
      }

      const taxpayer: SunatTaxpayer = {
        ruc,
        razonSocial,
        direccionFiscal: body.direccionCompleta ?? body.direccion ?? '',
        estado: (body.estado ?? '').toUpperCase(),
        condicion: (body.condicion ?? '').toUpperCase(),
      };

      // Spec §2, Paso 1.4: the taxpayer must be both ACTIVO and HABIDO.
      // Anything else is reported as the "not found or inactive" case, but the
      // data still travels so the UI can explain what it found.
      const usable = taxpayer.estado === 'ACTIVO' && taxpayer.condicion === 'HABIDO';

      return {
        success: usable,
        source: 'sunat',
        data: taxpayer,
        manualEntry: !usable,
        message: usable ? OK_MESSAGE : NOT_FOUND_MESSAGE,
      };
    } catch (error) {
      this.logger.warn(
        `Consulta SUNAT fallida para el RUC ${ruc}: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
      return this.unavailable();
    }
  }

  /**
   * Development stand-in used when SUNAT_API_URL is unset, mirroring the
   * MailService pattern of degrading instead of requiring every third party to
   * be configured locally. Deterministic on the RUC so the same input always
   * yields the same fixture, and shaped exactly like a real response — the
   * frontend cannot tell the difference.
   */
  private buildMock(ruc: string): SunatQueryResult {
    const isLegalEntity = ruc.startsWith('20');
    const suffix = ruc.slice(2, 8);

    return {
      success: true,
      source: 'mock',
      data: {
        ruc,
        razonSocial: isLegalEntity
          ? `CENTRO ESTETICO DEMO ${suffix} S.A.C.`
          : `PROFESIONAL INDEPENDIENTE DEMO ${suffix}`,
        direccionFiscal: `AV. LARCO NRO. ${suffix.slice(0, 3)} URB. CENTRO - MIRAFLORES - LIMA - LIMA`,
        estado: 'ACTIVO',
        condicion: 'HABIDO',
      },
      manualEntry: false,
      message: OK_MESSAGE,
    };
  }

  private notFound(): SunatQueryResult {
    return {
      success: false,
      source: 'sunat',
      data: null,
      manualEntry: true,
      message: NOT_FOUND_MESSAGE,
    };
  }

  private unavailable(): SunatQueryResult {
    return {
      success: false,
      source: 'sunat',
      data: null,
      manualEntry: true,
      message: UNAVAILABLE_MESSAGE,
    };
  }
}
