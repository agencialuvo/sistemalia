import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { createHash, randomBytes, randomInt } from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

const OTP_MAX_ATTEMPTS = 3;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const OTP_INVALID_MESSAGE = 'El código ingresado es inválido o ha expirado.';
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'Si el correo coincide con una cuenta activa, recibirás instrucciones para restablecer tu contraseña en breve.';
const INVALID_CREDENTIALS_MESSAGE = 'Credenciales inválidas.';
const SESSION_EXPIRED_MESSAGE = 'Sesión expirada. Inicia sesión nuevamente.';

interface GoogleProfileInput {
  googleId: string;
  email: string;
  fullName: string;
}

interface RefreshTokenPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
}

export interface VerifiedUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con este correo electrónico.');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        status: 'PENDING_VERIFICATION',
        provider: 'LOCAL',
      },
    });

    const otp = this.generateOtp();
    await this.redis.setOtp(user.id, otp);
    await this.mail.sendOtpEmail(user.email, otp);

    return { message: 'Registro exitoso. Revisa tu correo para el código de verificación.' };
  }

  async verifyOtp(
    dto: VerifyOtpDto,
  ): Promise<{ user: VerifiedUser; accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new BadRequestException(OTP_INVALID_MESSAGE);
    }

    const storedOtp = await this.redis.getOtp(user.id);
    if (!storedOtp) {
      throw new BadRequestException(OTP_INVALID_MESSAGE);
    }

    if (storedOtp !== dto.code) {
      const attempts = await this.redis.incrementOtpAttempts(user.id);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await this.redis.deleteOtp(user.id);
        throw new BadRequestException('Demasiados intentos fallidos. Solicita un nuevo código.');
      }
      throw new BadRequestException(OTP_INVALID_MESSAGE);
    }

    await this.redis.deleteOtp(user.id);

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { status: 'ACTIVE', emailVerified: true },
    });

    const { accessToken, refreshToken } = await this.issueTokens(
      updatedUser.id,
      updatedUser.email,
    );

    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        status: updatedUser.status,
      },
      accessToken,
      refreshToken,
    };
  }

  async login(
    dto: LoginDto,
  ): Promise<{ user: VerifiedUser; accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.provider !== 'LOCAL' || !user.passwordHash) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.status === 'PENDING_VERIFICATION') {
      throw new ForbiddenException(
        'Debe verificar su cuenta con el código OTP enviado a su correo.',
      );
    }

    const { accessToken, refreshToken } = await this.issueTokens(user.id, user.email);

    return {
      user: { id: user.id, email: user.email, fullName: user.fullName, status: user.status },
      accessToken,
      refreshToken,
    };
  }

  async refreshTokens(
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(rawRefreshToken);
    } catch {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (
      !stored ||
      stored.revoked ||
      stored.expiresAt < new Date() ||
      stored.userId !== payload.sub
    ) {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    // Rotate: revoke the presented refresh token so it can't be replayed,
    // then issue a fresh access/refresh pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    return this.issueTokens(payload.sub, payload.email);
  }

  async resendOtp(dto: ResendOtpDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.status !== 'PENDING_VERIFICATION') {
      throw new BadRequestException('No hay una verificación pendiente para este correo.');
    }

    const onCooldown = await this.redis.hasOtpResendCooldown(user.id);
    if (onCooldown) {
      throw new BadRequestException('Espera unos segundos antes de solicitar un nuevo código.');
    }

    // Clears any residual code and failed-attempts counter from the
    // previous OTP before issuing a fresh one.
    await this.redis.deleteOtp(user.id);
    const otp = this.generateOtp();
    await this.redis.setOtp(user.id, otp);
    await this.redis.setOtpResendCooldown(user.id);
    await this.mail.sendOtpEmail(user.email, otp);

    return { message: 'Se envió un nuevo código de verificación a tu correo.' };
  }

  async validateGoogleUser(input: GoogleProfileInput): Promise<VerifiedUser> {
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: input.googleId }, { email: input.email }] },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash: null,
          provider: 'GOOGLE',
          status: 'ACTIVE',
          emailVerified: true,
          googleId: input.googleId,
        },
      });
    } else if (!user.googleId || user.status !== 'ACTIVE') {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: user.googleId ?? input.googleId,
          status: 'ACTIVE',
          emailVerified: true,
        },
      });
    }

    return { id: user.id, email: user.email, fullName: user.fullName, status: user.status };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (user && user.provider === 'LOCAL') {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await this.redis.setResetToken(tokenHash, user.id);
      await this.mail.sendPasswordResetEmail(user.email, rawToken);
    } else if (user && user.provider === 'GOOGLE') {
      await this.mail.sendGoogleAccountNotice(user.email);
    }

    // Anti-enumeration: always the same response, whether or not the email exists.
    return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const userId = await this.redis.getResetToken(tokenHash);
    if (!userId) {
      throw new BadRequestException('El enlace de restablecimiento es inválido o ha expirado.');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    await this.redis.deleteResetToken(tokenHash);

    return { message: 'Contraseña actualizada correctamente. Por favor inicia sesión nuevamente.' };
  }

  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  async issueTokens(
    userId: string,
    email: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { expiresIn: ACCESS_TOKEN_TTL },
    );
    // jti: two refresh tokens for the same user minted within the same
    // second would otherwise be byte-identical (same payload + same
    // 1s-resolution `iat`), colliding on RefreshToken.tokenHash's unique
    // constraint — e.g. verify-otp immediately followed by login.
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, email, type: 'refresh', jti: randomBytes(16).toString('hex') },
      { expiresIn: REFRESH_TOKEN_TTL },
    );

    // Refresh tokens are high-entropy JWTs already, so a plain SHA-256 hash
    // (vs. argon2) is enough to keep the raw token out of the database.
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }
}
