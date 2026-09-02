/**
 * Carga e inicializa el SDK de Facebook (Tasks 3.3-3.4) — mismo patrón de
 * "un solo script, cacheado en una promesa module-level" que
 * lib/recaptcha.ts usa para el SDK de reCAPTCHA.
 */

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options?: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

export interface FacebookLoginResponse {
  status: "connected" | "not_authorized" | "unknown";
  authResponse: { accessToken?: string; code?: string; userID?: string } | null;
}

/** Debe coincidir con GRAPH_API_VERSION en
 *  backend/src/modules/social-channels/social-channels.service.ts — un
 *  desfase de versión entre el SDK del navegador y la Graph API que llama el
 *  backend puede cambiar la forma de `authResponse`. */
const SDK_VERSION = "v21.0";
const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;

let sdkPromise: Promise<void> | null = null;

/** Idempotente: si ya se llamó antes (otra tarjeta del mismo `ChannelCard`
 *  grid, o una re-visita a la página) reusa la promesa/script existente en
 *  vez de inyectar el `<script>` dos veces. */
export function loadMetaSdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("El SDK de Meta solo puede cargarse en el navegador."));
  }
  if (window.FB) return Promise.resolve();
  if (!APP_ID) {
    return Promise.reject(
      new Error("NEXT_PUBLIC_META_APP_ID no está configurado — no se puede iniciar la conexión con Meta."),
    );
  }

  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      window.fbAsyncInit = () => {
        window.FB!.init({ appId: APP_ID, cookie: true, xfbml: false, version: SDK_VERSION });
        resolve();
      };

      const script = document.createElement("script");
      script.src = "https://connect.facebook.net/es_LA/sdk.js";
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        sdkPromise = null;
        reject(new Error("No se pudo cargar el SDK de Meta."));
      };
      document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

/** Envuelve `FB.login()` (callback-based) en una Promise — usado tanto para
 *  "Conectar con Meta" (Páginas/Instagram) como para el primer paso de
 *  WhatsApp Embedded Signup, cada uno con sus propios `options`. */
export async function loginWithFacebook(
  options: Record<string, unknown> = {},
): Promise<FacebookLoginResponse> {
  await loadMetaSdk();
  return new Promise((resolve) => {
    window.FB!.login((response) => resolve(response), options);
  });
}

/** Permisos de Página/Instagram que pide "Conectar con Meta" (spec RF-1) —
 *  determina qué endpoints de la Graph API puede llamar después el backend
 *  con el token resultante (ej. `leads_retrieval` habilita leer Lead Ads). */
const META_CONNECT_SCOPE = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "leads_retrieval",
  "instagram_basic",
  "instagram_manage_messages",
].join(",");

export async function loginForMetaPages(): Promise<FacebookLoginResponse> {
  return loginWithFacebook({ scope: META_CONNECT_SCOPE });
}

// ---------------------------------------------------------------------------
// WhatsApp Embedded Signup
// ---------------------------------------------------------------------------

interface WhatsAppSignupEventData {
  event?: string;
  data?: { waba_id?: string; phone_number_id?: string };
}

const WHATSAPP_SIGNUP_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — el usuario puede tardar en completar el modal.

/**
 * El `code` que devuelve `FB.login()` no trae `waba_id`/`phone_number_id` —
 * esos solo llegan por un evento `postMessage` que el propio popup de
 * Embedded Signup dispara al terminar (documentado por Meta, no hay forma de
 * pedirlo por Graph API directamente). Se arma la promesa ANTES de abrir el
 * login para no perder el mensaje si llega mientras el listener todavía no
 * estaba registrado.
 */
function listenForWhatsAppSignupEvent(): Promise<{ wabaId: string; phoneNumberId: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("El proceso de conexión de WhatsApp tardó demasiado o se cerró sin completarse."));
    }, WHATSAPP_SIGNUP_TIMEOUT_MS);

    function handleMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      let payload: WhatsAppSignupEventData;
      try {
        payload = JSON.parse(event.data as string) as WhatsAppSignupEventData;
      } catch {
        return; // No todo mensaje de facebook.com es el de Embedded Signup — se ignora silenciosamente.
      }
      if (payload.event !== "FINISH" || !payload.data?.waba_id || !payload.data?.phone_number_id) return;

      clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      resolve({ wabaId: payload.data.waba_id, phoneNumberId: payload.data.phone_number_id });
    }

    window.addEventListener("message", handleMessage);
  });
}

export interface WhatsAppSignupResult {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

/**
 * Orquesta el flujo completo de *Meta Embedded Signup*: abre `FB.login()`
 * con el `config_id` de WhatsApp (creado en Meta Business Manager) mientras
 * escucha en paralelo el evento `postMessage` que trae `waba_id`/
 * `phone_number_id` — ninguno de los dos por sí solo alcanza para
 * `POST /marketing/channels/whatsapp/connect` (Task 2.4), que exige los 3
 * campos juntos.
 */
export async function loginForWhatsAppSignup(configId: string): Promise<WhatsAppSignupResult> {
  const signupEvent = listenForWhatsAppSignupEvent();
  const login = loginWithFacebook({
    config_id: configId,
    response_type: "code",
    override_default_response_type: true,
    extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
  });

  const [response, { wabaId, phoneNumberId }] = await Promise.all([login, signupEvent]);
  const code = response.authResponse?.code;
  if (response.status !== "connected" || !code) {
    throw new Error("No se completó la conexión con WhatsApp. Vuelve a intentarlo.");
  }

  return { code, wabaId, phoneNumberId };
}
