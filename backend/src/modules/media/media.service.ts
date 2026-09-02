import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MediaKind } from '@prisma/client';
import { randomBytes } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const RECORD_NOT_FOUND = 'P2025';

/** One entry per accepted MIME type: its `MediaKind`, the extension used to
 *  store it, the magic bytes that prove the content really is what it claims
 *  to be, and the per-kind size ceiling (video needs more room than a PDF). */
interface MediaTypeRule {
  kind: MediaKind;
  extension: string;
  maxSizeBytes: number;
  matches: (buffer: Buffer) => boolean;
}

const MB = 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * MB;
const MAX_VIDEO_BYTES = 200 * MB;
const MAX_AUDIO_BYTES = 50 * MB;
const MAX_PDF_BYTES = 25 * MB;

const startsWith = (buffer: Buffer, bytes: number[]) =>
  bytes.every((byte, index) => buffer[index] === byte);

/** Formatos permitidos (único lugar donde se decide qué se acepta):
 *  IMÁGENES = WebP/JPG/PNG, VIDEO = MP4, AUDIO = MP3, DOCUMENTOS = PDF.
 *  Cualquier otro mimetype (GIF, MOV, WEBM, etc.) se rechaza. */
const MEDIA_TYPE_RULES: Record<string, MediaTypeRule> = {
  'image/png': {
    kind: MediaKind.IMAGE,
    extension: '.png',
    maxSizeBytes: MAX_IMAGE_BYTES,
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  'image/jpeg': {
    kind: MediaKind.IMAGE,
    extension: '.jpg',
    maxSizeBytes: MAX_IMAGE_BYTES,
    matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  'image/webp': {
    kind: MediaKind.IMAGE,
    extension: '.webp',
    maxSizeBytes: MAX_IMAGE_BYTES,
    matches: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  'application/pdf': {
    kind: MediaKind.PDF,
    extension: '.pdf',
    maxSizeBytes: MAX_PDF_BYTES,
    matches: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-',
  },
  'video/mp4': {
    kind: MediaKind.VIDEO,
    extension: '.mp4',
    maxSizeBytes: MAX_VIDEO_BYTES,
    // ISO base media container: bytes 4-7 spell "ftyp" regardless of brand.
    matches: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp',
  },
  'audio/mpeg': {
    kind: MediaKind.AUDIO,
    extension: '.mp3',
    maxSizeBytes: MAX_AUDIO_BYTES,
    // Con tag ID3 (la mayoría de archivos "reales") o, si no lo trae, el
    // frame sync de MPEG audio (11 bits en 1: 0xFF seguido de 0xEx-0xFx).
    matches: (b) =>
      b.subarray(0, 3).toString('ascii') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  },
};

export const ALLOWED_MEDIA_MIME_TYPES = Object.keys(MEDIA_TYPE_RULES);
/** Multer's own ceiling — the per-kind check below is the real limit; this
 *  one only exists so an enormous upload is rejected before it fills memory. */
export const MAX_MEDIA_UPLOAD_BYTES = MAX_VIDEO_BYTES;

/**
 * Biblioteca de medios del tenant (menú "Medios"): imágenes, GIF, video y PDF
 * que luego se reutilizan en el catálogo, campañas o el agente de IA.
 *
 * Mismo driver de disco local que UploadService (spec: "o almacenamiento
 * local en dev") — cambiar a Cloudflare R2 / S3 más adelante significa
 * reemplazar `persist()`/`remove()`, los llamadores solo ven la `url`.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly publicDir = join(process.cwd(), 'public');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async findAll(tenantId: string, kind?: MediaKind) {
    return this.prisma.mediaAsset.findMany({
      where: { tenantId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(tenantId: string, file: Express.Multer.File | undefined) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('Debes adjuntar un archivo.');
    }

    const rule = MEDIA_TYPE_RULES[file.mimetype];
    if (!rule) {
      throw new BadRequestException(
        'Formato no permitido. Usa una imagen (JPG, PNG, WEBP), un video (MP4), un audio (MP3) o un PDF.',
      );
    }
    if (file.size > rule.maxSizeBytes) {
      throw new BadRequestException(
        `El archivo supera el máximo permitido de ${Math.floor(rule.maxSizeBytes / MB)}MB para este tipo.`,
      );
    }
    if (!rule.matches(file.buffer)) {
      throw new BadRequestException(
        'El contenido del archivo no coincide con su extensión declarada.',
      );
    }

    const relativePath = `uploads/media/${tenantId}/${randomBytes(16).toString('hex')}${rule.extension}`;
    await this.persist(relativePath, file.buffer);

    const baseUrl = this.config.get<string>('PUBLIC_BASE_URL', 'http://localhost:4000');
    const url = `${baseUrl.replace(/\/$/, '')}/static/${relativePath}`;

    const asset = await this.prisma.mediaAsset.create({
      data: {
        tenantId,
        fileName: file.originalname,
        url,
        mimeType: file.mimetype,
        kind: rule.kind,
        sizeBytes: file.size,
      },
    });

    this.logger.log(`Archivo subido para el tenant ${tenantId}: ${url}`);
    return asset;
  }

  async remove(tenantId: string, id: string): Promise<{ id: string; deleted: true }> {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, tenantId } });
    if (!asset) {
      throw new NotFoundException('El archivo no existe o no pertenece a tu centro estético.');
    }

    try {
      await this.prisma.mediaAsset.delete({ where: { id, tenantId } });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === RECORD_NOT_FOUND) {
        throw new NotFoundException('El archivo no existe o no pertenece a tu centro estético.');
      }
      throw error;
    }

    // Best-effort: an orphaned file on disk is a cleanup issue, not a reason
    // to fail a delete the user is watching for a result.
    await this.removeFromDisk(asset.url).catch((error) =>
      this.logger.warn(`No se pudo borrar el archivo físico de ${asset.url}: ${error}`),
    );

    return { id, deleted: true };
  }

  private async persist(relativePath: string, buffer: Buffer): Promise<void> {
    const absolutePath = join(this.publicDir, ...relativePath.split('/'));
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);
  }

  private async removeFromDisk(url: string): Promise<void> {
    const marker = '/static/';
    const index = url.indexOf(marker);
    if (index === -1) return;
    const relativePath = url.slice(index + marker.length);
    const absolutePath = join(this.publicDir, ...relativePath.split('/'));
    await unlink(absolutePath);
  }
}
