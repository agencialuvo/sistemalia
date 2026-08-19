import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService, VerifiedUser } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      // passport-oauth2 requires non-empty strings at construction time, so
      // the app can still boot in dev without Google credentials configured
      // — only the /auth/google routes themselves would fail when hit.
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || 'not-configured',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || 'not-configured',
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') || 'http://localhost:4000/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        done(new Error('La cuenta de Google no tiene un correo verificado.'), false);
        return;
      }

      const user: VerifiedUser = await this.authService.validateGoogleUser({
        googleId: profile.id,
        email,
        fullName: profile.displayName || email,
      });

      done(null, user);
    } catch (err) {
      done(err as Error, false);
    }
  }
}
