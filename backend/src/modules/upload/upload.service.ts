import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, extname, join } from 'path';

/** MIME types accepted for the tenant logo (spec §2, Paso 3.1). */
export const ALLOWED_LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

/**
 * Leading bytes of each accepted format. `mimetype` is client-supplied and
 * trivially spoofed, so the declared type is cross-checked against what the
 * bytes actually are before anything is written to disk.
 */
const MAGIC_NUMBERS: { mime: string; matches: (buffer: Buffer) => boolean }[] = [
  {
    mime: 'image/png',
    matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/jpeg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    // RIFF....WEBP
    mime: 'image/webp',
    matches: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export interface UploadedLogo {
  logoUrl: string;
  size: number;
  mimeType: string;
}

/**
 * Stores tenant logos.
 *
 * Local-disk driver (Task 2.2: "o almacenamiento local en dev"): files land in
 * `public/uploads/logos/` and are served by the static handler mounted in
 * main.ts under `/static`. Swapping in Cloudflare R2 / S3 later means
 * replacing `persist()` — callers only ever see the returned `logoUrl`.
 *
 * Note the layout is `logos/{userId}/…` rather than the `tenants/{tenantId}/`
 * of spec §2 Paso 3.1: the logo is uploaded during Paso 3, before the Tenant
 * row exists, so there is no tenant id to key on yet.
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly publicDir = join(process.cwd(), 'public');

  constructor(private readonly config: ConfigService) {}

  async uploadLogo(userId: string, file: Express.Multer.File): Promise<UploadedLogo> {
    this.validate(file);

    const extension = MIME_EXTENSIONS[file.mimetype] ?? extname(file.originalname).toLowerCase();
    // Kept URL-shaped (forward slashes) rather than built with path.join, so
    // the same value works as both a URL suffix and — via persist() — a path
    // on Windows, where join() would have produced backslashes.
    const relativePath = `uploads/logos/${userId}/${randomBytes(16).toString('hex')}${extension}`;

    await this.persist(relativePath, file.buffer);

    const baseUrl = this.config.get<string>('PUBLIC_BASE_URL', 'http://localhost:4000');
    const logoUrl = `${baseUrl.replace(/\/$/, '')}/static/${relativePath}`;

    this.logger.log(`Logo almacenado para el usuario ${userId}: ${logoUrl}`);
    return { logoUrl, size: file.size, mimeType: file.mimetype };
  }

  /**
   * Server-side validation (spec §4, criterion 3). Multer's `limits.fileSize`
   * already truncates oversized uploads, but the size is re-checked here so the
   * rule holds regardless of how the file reached the service.
   */
  private validate(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('Debes adjuntar un archivo de imagen.');
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      throw new BadRequestException('El logotipo no puede superar los 5MB.');
    }

    if (!ALLOWED_LOGO_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_LOGO_MIME_TYPES)[number])) {
      throw new BadRequestException(
        'Formato no permitido. Usa una imagen .jpg, .jpeg, .png o .webp.',
      );
    }

    const actual = MAGIC_NUMBERS.find((candidate) => candidate.matches(file.buffer));
    if (actual?.mime !== file.mimetype) {
      throw new BadRequestException(
        'El archivo no es una imagen válida o su contenido no coincide con su extensión.',
      );
    }
  }

  private async persist(relativePath: string, buffer: Buffer): Promise<void> {
    const absolutePath = join(this.publicDir, ...relativePath.split('/'));
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);
  }
}
