// Mirrors backend/src/modules/auth/validators/disposable-email-domains.ts.
// Kept in sync manually — the frontend and backend are separate apps
// (backend/ is NestJS, this is the Next.js app), so the DTO/schema
// validation is duplicated by design rather than shared at runtime.
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "yopmail.com",
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "guerrillamail.biz",
  "guerrillamail.de",
  "guerrillamail.net",
  "guerrillamail.org",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "trashmail.com",
  "getnada.com",
  "dispostable.com",
  "fakeinbox.com",
  "mailnesia.com",
  "mintemail.com",
  "sharklasers.com",
  "moakt.com",
  "emailondeck.com",
  "maildrop.cc",
]);
