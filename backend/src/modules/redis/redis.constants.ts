export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const OTP_TTL_SECONDS = 900; // 15 minutes, per spec 01-auth
export const RESET_TOKEN_TTL_SECONDS = 3600; // 1 hour, per spec 01-auth
export const OTP_RESEND_COOLDOWN_SECONDS = 60; // per spec 01-auth
