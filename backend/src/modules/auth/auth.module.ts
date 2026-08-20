import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RecaptchaGuard } from './guards/recaptcha.guard';
import { GoogleStrategy } from './strategies/google.strategy';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    PassportModule,
    // global: every module that protects a route with the shared JwtAuthGuard
    // (tenant, upload, sunat…) needs JwtService, and the signing secret must
    // stay defined in exactly one place — re-registering JwtModule per feature
    // module would invite two of them drifting apart.
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RecaptchaGuard, GoogleStrategy],
})
export class AuthModule {}
