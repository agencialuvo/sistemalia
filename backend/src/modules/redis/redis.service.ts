import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  GOOGLE_OAUTH_STATE_TTL_SECONDS,
  ONBOARDING_DRAFT_TTL_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  REDIS_CLIENT,
  RESET_TOKEN_TTL_SECONDS,
  SUNAT_CACHE_TTL_SECONDS,
} from './redis.constants';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  private otpKey(userId: string): string {
    return `otp:${userId}`;
  }

  private otpAttemptsKey(userId: string): string {
    return `otp_attempts:${userId}`;
  }

  /** Stores the OTP code for a user, expiring automatically after `ttlSeconds` (default 15 min). */
  async setOtp(userId: string, code: string, ttlSeconds = OTP_TTL_SECONDS): Promise<void> {
    await this.client.set(this.otpKey(userId), code, 'EX', ttlSeconds);
  }

  /** Returns the active OTP code for a user, or null if it doesn't exist / has expired. */
  async getOtp(userId: string): Promise<string | null> {
    return this.client.get(this.otpKey(userId));
  }

  /**
   * Deletes the OTP and its attempts counter. Called both after a successful
   * verification and after the attempts counter hits the lockout threshold,
   * so the attempts counter must not outlive the code it was guarding.
   */
  async deleteOtp(userId: string): Promise<void> {
    await this.client.del(this.otpKey(userId), this.otpAttemptsKey(userId));
  }

  /**
   * Increments the failed-attempts counter for a user's OTP and returns the
   * new count. The counter shares the OTP's TTL so it never outlives the code.
   */
  async incrementOtpAttempts(userId: string): Promise<number> {
    const key = this.otpAttemptsKey(userId);
    const attempts = await this.client.incr(key);
    if (attempts === 1) {
      await this.client.expire(key, OTP_TTL_SECONDS);
    }
    return attempts;
  }

  private resetTokenKey(tokenHash: string): string {
    return `reset_token:${tokenHash}`;
  }

  /** Stores the userId a password-reset token hash resolves to, expiring after `ttlSeconds` (default 1h). */
  async setResetToken(
    tokenHash: string,
    userId: string,
    ttlSeconds = RESET_TOKEN_TTL_SECONDS,
  ): Promise<void> {
    await this.client.set(this.resetTokenKey(tokenHash), userId, 'EX', ttlSeconds);
  }

  /** Returns the userId associated with a reset token hash, or null if it doesn't exist / has expired. */
  async getResetToken(tokenHash: string): Promise<string | null> {
    return this.client.get(this.resetTokenKey(tokenHash));
  }

  async deleteResetToken(tokenHash: string): Promise<void> {
    await this.client.del(this.resetTokenKey(tokenHash));
  }

  private otpResendCooldownKey(userId: string): string {
    return `otp_resend_cooldown:${userId}`;
  }

  /** Marks that a user just requested an OTP resend, blocking another one for `ttlSeconds` (default 60s). */
  async setOtpResendCooldown(
    userId: string,
    ttlSeconds = OTP_RESEND_COOLDOWN_SECONDS,
  ): Promise<void> {
    await this.client.set(this.otpResendCooldownKey(userId), '1', 'EX', ttlSeconds);
  }

  async hasOtpResendCooldown(userId: string): Promise<boolean> {
    const exists = await this.client.exists(this.otpResendCooldownKey(userId));
    return exists === 1;
  }

  // --- Feature 02: tenant onboarding -------------------------------------

  private sunatKey(ruc: string): string {
    return `sunat:ruc:${ruc}`;
  }

  /** Caches a SUNAT taxpayer lookup as raw JSON (default TTL 24h, per plan.md). */
  async setSunatTaxpayer(
    ruc: string,
    payload: string,
    ttlSeconds = SUNAT_CACHE_TTL_SECONDS,
  ): Promise<void> {
    await this.client.set(this.sunatKey(ruc), payload, 'EX', ttlSeconds);
  }

  /** Returns the cached SUNAT payload for a RUC, or null if never cached / expired. */
  async getSunatTaxpayer(ruc: string): Promise<string | null> {
    return this.client.get(this.sunatKey(ruc));
  }

  private onboardingDraftKey(userId: string): string {
    return `onboarding_step:${userId}`;
  }

  /**
   * Stores the in-progress onboarding wizard state so closing the tab mid-way
   * resumes on the same step (spec §1, "Persistencia del Estado").
   */
  async setOnboardingDraft(
    userId: string,
    payload: string,
    ttlSeconds = ONBOARDING_DRAFT_TTL_SECONDS,
  ): Promise<void> {
    await this.client.set(this.onboardingDraftKey(userId), payload, 'EX', ttlSeconds);
  }

  async getOnboardingDraft(userId: string): Promise<string | null> {
    return this.client.get(this.onboardingDraftKey(userId));
  }

  /**
   * Drops the wizard draft once the tenant exists. Called inside the onboarding
   * flow so a finished account can never be bounced back into a half-filled
   * wizard by a stale Redis key.
   */
  async deleteOnboardingDraft(userId: string): Promise<void> {
    await this.client.del(this.onboardingDraftKey(userId));
  }

  // --- Feature 09: Google Calendar Jerárquico -----------------------------

  private googleOAuthStateKey(state: string): string {
    return `google_oauth_state:${state}`;
  }

  /** Maps a random OAuth `state` param to the tenant that started the
   *  connect flow — see redis.constants.ts's GOOGLE_OAUTH_STATE_TTL_SECONDS
   *  doc comment for why this exists instead of the usual @TenantId(). */
  async setGoogleOAuthState(
    state: string,
    tenantId: string,
    ttlSeconds = GOOGLE_OAUTH_STATE_TTL_SECONDS,
  ): Promise<void> {
    await this.client.set(this.googleOAuthStateKey(state), tenantId, 'EX', ttlSeconds);
  }

  async getGoogleOAuthState(state: string): Promise<string | null> {
    return this.client.get(this.googleOAuthStateKey(state));
  }

  /** Single-use: called right after a successful read so a replayed/leaked
   *  `state` value cannot be reused to hijack the callback. */
  async deleteGoogleOAuthState(state: string): Promise<void> {
    await this.client.del(this.googleOAuthStateKey(state));
  }
}
