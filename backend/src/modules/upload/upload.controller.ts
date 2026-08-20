import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MAX_LOGO_SIZE_BYTES, UploadedLogo, UploadService } from './upload.service';

@Controller('tenant')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * POST /tenant/upload-logo — multipart/form-data, field `file`.
   *
   * Runs before the tenant exists (Paso 3 of the wizard), so it is keyed on the
   * authenticated user and returns a `logoUrl` the client then submits with
   * POST /tenant/onboarding.
   *
   * memoryStorage keeps the 5MB cap meaningful: with disk storage multer would
   * write the file out before any validation ran, so a rejected upload would
   * still have touched the filesystem.
   */
  @Post('upload-logo')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_LOGO_SIZE_BYTES, files: 1 },
    }),
  )
  uploadLogo(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadedLogo> {
    return this.uploadService.uploadLogo(userId, file);
  }
}
