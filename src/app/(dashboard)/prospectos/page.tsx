import { redirect } from "next/navigation";

/** "Prospectos" se movió bajo /marketing (Feature 11) — se mantiene resoluble
 *  para que bookmarks y enlaces viejos no rompan (mismo criterio que /citas
 *  y /calendario redirigiendo a /agenda). */
export default function Page() {
  redirect("/marketing/prospectos");
}
