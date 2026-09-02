import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { QueryConversationsDto } from './dto/query-conversations.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { InboxService } from './inbox.service';

/** UUID v4 para :id — mismo criterio que ProspectsController/PatientsController. */
const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('El identificador no es válido.'),
});

/** Módulo 12 — Inbox Unificado (Chat Omnicanal), Fase 2 (Task 2.4). */
@Controller('marketing/inbox/conversations')
@UseGuards(JwtAuthGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  findAll(@TenantId() tenantId: string, @Query() query: QueryConversationsDto) {
    return this.inbox.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.inbox.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.inbox.update(tenantId, id, dto);
  }

  @Post(':id/messages')
  sendMessage(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.inbox.sendMessage(tenantId, id, userId, dto);
  }
}
