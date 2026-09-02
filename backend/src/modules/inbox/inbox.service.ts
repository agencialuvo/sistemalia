import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Conversation, Prisma, SocialChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryConversationsDto } from './dto/query-conversations.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { MessagingSenderService } from './messaging-sender.service';

const DEFAULT_PAGE_SIZE = 20;

export interface InboundMessageInput {
  externalUserId: string;
  externalId: string | null;
  body: string;
  attachments?: { type: string; url: string }[] | null;
  contactName?: string | null;
  contactPhone?: string | null;
}

/**
 * Módulo 12 — Inbox Unificado, Fase 2. Mismo criterio de aislamiento por
 * tenantId que ProspectsService/PatientsService: todo `findFirst`/`update`
 * de una Conversation filtra por `{ id, tenantId }`.
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingSender: MessagingSenderService,
  ) {}

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  /** GET /marketing/inbox/conversations — ordenada por actividad reciente
   *  (spec RF-1), no por fecha de creación. */
  async findAll(tenantId: string, query: QueryConversationsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.ConversationWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.provider ? { channel: { provider: query.provider } } : {}),
      ...(query.search
        ? {
            OR: [
              { contactName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { contactPhone: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: CONVERSATION_LIST_INCLUDE,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** GET /marketing/inbox/conversations/:id — incluye los mensajes del hilo
   *  en orden cronológico ascendente (spec plan §2: "Detalle del hilo y
   *  mensajes"). */
  async findOne(tenantId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, tenantId },
      include: CONVERSATION_DETAIL_INCLUDE,
    });
    if (!conversation) {
      throw new NotFoundException('La conversación no existe o no pertenece a tu centro estético.');
    }
    return conversation;
  }

  // -------------------------------------------------------------------------
  // Escritura — API
  // -------------------------------------------------------------------------

  /** PATCH /marketing/inbox/conversations/:id. */
  async update(tenantId: string, id: string, dto: UpdateConversationDto): Promise<Conversation> {
    await this.assertBelongsToTenant(tenantId, id);

    return this.prisma.conversation.update({
      where: { id },
      data: {
        status: dto.status,
        assignedUserId: dto.assignedUserId === undefined ? undefined : dto.assignedUserId,
      },
    });
  }

  /**
   * POST /marketing/inbox/conversations/:id/messages. Si `MessagingSenderService`
   * falla (token vencido, destinatario fuera de la ventana de 24h de Meta,
   * etc.), igual se guarda el Message con `status: 'FAILED'` para que quede
   * visible en el hilo — el usuario ve exactamente qué intento de respuesta
   * no salió, en vez de que el error desaparezca en un toast.
   */
  async sendMessage(tenantId: string, conversationId: string, userId: string, dto: SendMessageDto) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      include: { channel: true },
    });
    if (!conversation) {
      throw new NotFoundException('La conversación no existe o no pertenece a tu centro estético.');
    }

    let externalId: string | null = null;
    try {
      externalId = await this.messagingSender.sendTextMessage(conversation.channel, conversation.externalUserId, dto.body);
    } catch (error) {
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          body: dto.body,
          status: 'FAILED',
          sentByUserId: userId,
        },
      });
      throw error;
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          externalId: externalId ?? undefined,
          direction: 'OUTBOUND',
          body: dto.body,
          status: 'SENT',
          sentByUserId: userId,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return message;
  }

  // -------------------------------------------------------------------------
  // Ingesta (consumida por InboxIngestionService desde el webhook de Meta)
  // -------------------------------------------------------------------------

  /**
   * Crea o recupera la Conversation de `[tenantId, channelId, externalUserId]`
   * y guarda el Message INBOUND — spec RF-1/RF-2. Vincula automáticamente con
   * un Patient o Prospect existente cuando `contactPhone` viene informado
   * (spec RF-3: "Reconocimiento de contacto por número telefónico"); Patient
   * tiene prioridad sobre Prospect porque un contacto ya convertido no debería
   * mostrarse como "prospecto" en el panel lateral (Fase 3).
   */
  async ingestInboundMessage(channel: SocialChannel, input: InboundMessageInput): Promise<void> {
    const conversation = await this.findOrCreateConversation(
      channel,
      input.externalUserId,
      input.contactName,
      input.contactPhone,
    );

    await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          externalId: input.externalId ?? undefined,
          direction: 'INBOUND',
          body: input.body,
          attachments: (input.attachments as Prisma.InputJsonValue | null) ?? undefined,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    this.logger.log(`Mensaje entrante guardado en la conversación ${conversation.id} (tenant ${channel.tenantId}).`);
  }

  private async findOrCreateConversation(
    channel: SocialChannel,
    externalUserId: string,
    contactName?: string | null,
    contactPhone?: string | null,
  ): Promise<Conversation> {
    const existing = await this.prisma.conversation.findUnique({
      where: {
        tenantId_channelId_externalUserId: { tenantId: channel.tenantId, channelId: channel.id, externalUserId },
      },
    });
    if (existing) {
      if (contactName && !existing.contactName) {
        return this.prisma.conversation.update({ where: { id: existing.id }, data: { contactName } });
      }
      return existing;
    }

    let prospectId: string | undefined;
    let patientId: string | undefined;
    if (contactPhone) {
      const patient = await this.prisma.patient.findFirst({
        where: { tenantId: channel.tenantId, phone: contactPhone },
        select: { id: true },
      });
      if (patient) {
        patientId = patient.id;
      } else {
        const prospect = await this.prisma.prospect.findFirst({
          where: { tenantId: channel.tenantId, phone: contactPhone },
          select: { id: true },
        });
        if (prospect) prospectId = prospect.id;
      }
    }

    return this.prisma.conversation.create({
      data: {
        tenantId: channel.tenantId,
        channelId: channel.id,
        externalUserId,
        contactName: contactName ?? undefined,
        contactPhone: contactPhone ?? undefined,
        prospectId,
        patientId,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Reglas de negocio
  // -------------------------------------------------------------------------

  private async assertBelongsToTenant(tenantId: string, id: string): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!conversation) {
      throw new NotFoundException('La conversación no existe o no pertenece a tu centro estético.');
    }
  }
}

const CONVERSATION_LIST_INCLUDE = {
  channel: { select: { id: true, provider: true, name: true } },
  assignedUser: { select: { id: true, fullName: true } },
  prospect: { select: { id: true, fullName: true } },
  patient: { select: { id: true, firstName: true, lastName: true } },
  // Solo el último — la lista (Fase 3, Columna 1) muestra un preview de una
  // línea, no el hilo completo. El detalle (findOne) pisa esta clave con el
  // hilo entero ordenado ascendente, ver abajo.
  messages: { orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.ConversationInclude;

const CONVERSATION_DETAIL_INCLUDE = {
  ...CONVERSATION_LIST_INCLUDE,
  messages: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ConversationInclude;
