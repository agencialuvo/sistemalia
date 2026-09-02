import { redirect } from "next/navigation";

/** /marketing/inbox -> /bandeja-entrada — el Inbox Unificado (Módulo 12) se
 *  movió a "Principal", debajo de "Panel", y pasó a llamarse "Bandeja de
 *  entrada" a pedido del usuario. Mismo criterio de redirect que
 *  /citas -> /agenda. */
export default function Page() {
  redirect("/bandeja-entrada");
}
