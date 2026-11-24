"use server";

import { redirect } from "next/navigation";
import { credentialsSchema } from "@/domain/schemas";
import { authErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";

// C-04: el éxito de estas acciones es un redirect a /app (no devuelven datos a la UI),
// así que el único estado que llega al formulario es el de fallo.
export type AuthFormState =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      fieldErrors?: { email?: string; password?: string };
      /** Email enviado, para no perderlo tras un error. */
      email?: string;
    };

function readCredentials(formData: FormData) {
  const rawEmail = formData.get("email");
  const parsed = credentialsSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
  });
  if (parsed.success) return { data: parsed.data, failure: undefined };
  const fieldErrors: { email?: string; password?: string } = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if ((field === "email" || field === "password") && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  const failure: AuthFormState = {
    ok: false,
    fieldErrors,
    email: typeof rawEmail === "string" ? rawEmail : "",
  };
  return { data: undefined, failure };
}

async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const creds = readCredentials(formData);
  if (creds.failure) return creds.failure;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(creds.data);
  if (error) {
    console.error("signIn falló:", error.code ?? error.status);
    return { ok: false, error: authErrorMessage(error.code), email: creds.data.email };
  }
  redirect("/app");
}

async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const creds = readCredentials(formData);
  if (creds.failure) return creds.failure;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(creds.data);
  if (error) {
    console.error("signUp falló:", error.code ?? error.status);
    return { ok: false, error: authErrorMessage(error.code), email: creds.data.email };
  }
  if (!data.session) {
    // Con confirmación de email activada no hay sesión hasta confirmar.
    return {
      ok: false,
      error: "Cuenta creada, pero falta confirmar el email. Revisa tu correo y vuelve a entrar.",
      email: creds.data.email,
    };
  }
  redirect("/app");
}

/**
 * Punto de entrada del formulario: un solo estado y una sola acción. El botón pulsado
 * (name="intent") decide si se entra o se crea la cuenta. Al ser una Server Action
 * directa, el formulario también funciona sin JavaScript (mejora progresiva).
 */
export async function authenticate(prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return formData.get("intent") === "signUp" ? signUp(prev, formData) : signIn(prev, formData);
}
