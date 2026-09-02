import { redirect } from "next/navigation";

/** /marketing/canales -> /integraciones — "Canales" se fusionó con
 *  Integraciones (Módulo 09 Google Calendar + Módulo 10 Meta/WhatsApp/TikTok)
 *  en una sola página bajo Configuración. Mismo criterio de redirect que
 *  /citas -> /agenda. */
export default function Page() {
  redirect("/integraciones");
}
