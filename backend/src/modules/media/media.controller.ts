import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaKind } from '@prisma/client';
import { memoryStorage } from 'multer';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MAX_MEDIA_UPLOAD_BYTES, MediaService } from './media.service';

const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('El identificador no es válido.'),
});

/** Biblioteca de medios (menú "Medios"): imágenes, video, audio y PDF. */
@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  findAll(@TenantId() tenantId: string, @Query('kind') kind?: string) {
    return this.media.findAll(tenantId, this.parseKind(kind));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_MEDIA_UPLOAD_BYTES, files: 1 },
    }),
  )
  upload(@TenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    return this.media.upload(tenantId, file);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.media.remove(tenantId, id);
  }

  private parseKind(raw: string | undefined): MediaKind | undefined {
    if (!raw) return undefined;
    if (!Object.values(MediaKind).includes(raw as MediaKind)) {
      throw new BadRequestException('El filtro "kind" no es válido.');
    }
    return raw as MediaKind;
  }
}
