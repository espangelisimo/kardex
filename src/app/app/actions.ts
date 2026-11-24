"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// C-04: esta acción no devuelve datos a la UI; siempre termina en redirect,
// así que no hay resultado que modelar como { ok, data | error }.
export async function signOut(): Promise<never> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("signOut falló:", error.message);
  }
  redirect("/login");
}
