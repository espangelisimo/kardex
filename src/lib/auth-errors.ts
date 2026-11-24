/** Mensaje genérico para cualquier código de error no contemplado. */
export const GENERIC_AUTH_ERROR = "No se ha podido completar la operación. Inténtalo de nuevo.";

// Códigos de error de Supabase Auth (ErrorCode de @supabase/auth-js) → mensaje propio (S-08).
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Email o contraseña incorrectos.",
  user_already_exists: "Ya existe una cuenta con ese email.",
  email_exists: "Ya existe una cuenta con ese email.",
  weak_password: "La contraseña es demasiado débil. Elige otra más larga o difícil de adivinar.",
  email_address_invalid: "El email no es válido.",
  email_not_confirmed: "Debes confirmar tu email antes de entrar.",
  signup_disabled: "El registro de cuentas nuevas no está disponible.",
  over_request_rate_limit: "Demasiados intentos. Espera un momento y vuelve a probar.",
  over_email_send_rate_limit: "Demasiados intentos. Espera un momento y vuelve a probar.",
};

export function authErrorMessage(code: string | undefined): string {
  if (code === undefined || !Object.hasOwn(MESSAGES, code)) return GENERIC_AUTH_ERROR;
  return MESSAGES[code] ?? GENERIC_AUTH_ERROR;
}
