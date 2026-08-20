import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from './app.module';

/**
 * Browser origins allowed to call this API.
 *
 * The Next.js app runs on a different port, so every request it makes is
 * cross-origin and needs CORS — without this the browser rejects the response
 * before the app ever sees it (the preflight OPTIONS 404s), which surfaces in
 * the UI as an unexplained "no se pudo" on login/registro.
 *
 * `credentials: true` with an explicit origin list (never "*", which the spec
 * forbids alongside credentials) because auth rides on httpOnly cookies and the
 * axios client sends `withCredentials`.
 *
 * Note the session cookies stay `sameSite: 'lax'`: ports are not part of a
 * "site", so localhost:3000 and localhost:4000 are same-site and the cookies
 * are sent and stored normally.
 */
function resolveCorsOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL;
  if (!configured) return ['http://localhost:3000'];
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(cookieParser());
  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
  });

  // Serves the tenant logos UploadService writes to public/uploads/logos.
  // Local-storage driver only: once uploads move to Cloudflare R2 / S3 the
  // files are served from the bucket and this mount becomes dead weight.
  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/static/' });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
