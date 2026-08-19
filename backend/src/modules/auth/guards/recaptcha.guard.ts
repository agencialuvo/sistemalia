import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

interface RecaptchaVerifyResponse {
  success: boolean;
  score?: number;
  'error-codes'?: string[];
}

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const MIN_SCORE = 0.5;

@Injectable()
export class RecaptchaGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secretKey = this.config.get<string>('RECAPTCHA_SECRET_KEY');
    const isDevelopment = this.config.get<string>('NODE_ENV') !== 'production';

    if (!secretKey) {
      if (isDevelopment) {
        // Dev bypass: no key configured locally, don't block the flow.
        return true;
      }
      throw new InternalServerErrorException('RECAPTCHA_SECRET_KEY no está configurada.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = (request.body as Record<string, unknown> | undefined)?.recaptchaToken;
    if (!token || typeof token !== 'string') {
      throw new ForbiddenException('recaptchaToken es requerido.');
    }

    const params = new URLSearchParams({ secret: secretKey, response: token });
    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const result = (await response.json()) as RecaptchaVerifyResponse;

    if (!result.success || (result.score ?? 0) < MIN_SCORE) {
      throw new ForbiddenException('Verificación anti-bot fallida.');
    }

    return true;
  }
}
