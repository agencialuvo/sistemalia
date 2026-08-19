declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.grecaptcha) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("No se pudo cargar reCAPTCHA."));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Resolves a reCAPTCHA v3 token for the given action. If no site key is
 * configured (local dev), returns a placeholder — mirrors the backend's
 * RecaptchaGuard, which bypasses verification when RECAPTCHA_SECRET_KEY
 * is unset outside production.
 */
export async function getRecaptchaToken(action: string): Promise<string> {
  if (!SITE_KEY) {
    return "dev-bypass-token";
  }

  await loadScript();
  return new Promise((resolve, reject) => {
    window.grecaptcha!.ready(() => {
      window.grecaptcha!.execute(SITE_KEY, { action }).then(resolve).catch(reject);
    });
  });
}
