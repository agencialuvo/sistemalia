import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthService, VerifiedUser } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RecaptchaGuard } from './guards/recaptcha.guard';

const ACCESS_TOKEN_COOKIE_MAX_AGE = 15 * 60 * 1000;
const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @UseGuards(RecaptchaGuard)
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.authService.verifyOtp(dto);
    this.setSessionCookies(res, accessToken, refreshToken);
    return { message: 'Cuenta verificada correctamente.', user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.authService.login(dto);
    this.setSessionCookies(res, accessToken, refreshToken);
    return { message: 'Inicio de sesión exitoso.', user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.refresh_token as string | undefined;
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Sesión expirada. Inicia sesión nuevamente.');
    }

    const { accessToken, refreshToken } = await this.authService.refreshTokens(rawRefreshToken);
    this.setSessionCookies(res, accessToken, refreshToken);
    return { message: 'Sesión renovada.' };
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Guard redirects to Google; body intentionally empty.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as VerifiedUser;
    const { accessToken, refreshToken } = await this.authService.issueTokens(user.id, user.email);
    this.setSessionCookies(res, accessToken, refreshToken);

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    res.redirect(`${frontendUrl}/dashboard`);
  }

  private setSessionCookies(res: Response, accessToken: string, refreshToken: string): void {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
    });
  }
}
