import { getRequestConfig } from 'next-intl/server';
import messages from '../../messages/es.json';

/**
 * Sistema LIA is a Spanish-only product: it serves centros estéticos in Perú,
 * and every surface — UI, validation messages, WhatsApp bot replies — is
 * written in Spanish.
 *
 * The locale is therefore fixed rather than read from NEXT_PUBLIC_APP_LOCALE.
 * That variable defaulted to 'en', which is why the whole app rendered in
 * English; leaving it configurable would keep a single stray env var able to
 * flip the product into a language nobody here speaks.
 *
 * messages/en.json and messages/ko.json are inherited from wacrm and are no
 * longer loaded. They are kept on disk so translations are not lost if the
 * product is ever localised again — reintroducing them means restoring the
 * dynamic import below, not re-translating 1,700 keys.
 */
export const APP_LOCALE = 'es';

export default getRequestConfig(async () => ({
  locale: APP_LOCALE,
  messages,
}));
