import { redirect } from "next/navigation";

/** "Calendario" fue absorbido por "Agenda" (unificación con "Citas") — se
 *  mantiene resoluble para que bookmarks y enlaces viejos no rompan. */
export default function Page() {
  redirect("/agenda");
}
