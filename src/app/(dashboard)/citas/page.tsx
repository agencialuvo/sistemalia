import { redirect } from "next/navigation";

/** "Citas" fue absorbido por "Agenda" (unificación con "Calendario") — se
 *  mantiene resoluble para que bookmarks y enlaces viejos no rompan. */
export default function Page() {
  redirect("/agenda");
}
