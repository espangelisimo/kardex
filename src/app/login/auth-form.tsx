"use client";

import { useActionState } from "react";
import { authenticate, type AuthFormState } from "./actions";

const INITIAL: AuthFormState = { ok: false };

const inputClass =
  "w-full rounded border border-black/30 bg-transparent px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-[invalid=true]:border-red-600 dark:border-white/40";
const buttonClass =
  "flex-1 rounded border border-black/30 px-3 py-2 font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:border-white/40 dark:hover:bg-white/10";

export function AuthForm() {
  const [state, action, pending] = useActionState(authenticate, INITIAL);
  const failed = state.ok ? undefined : state;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={failed?.email ?? ""}
          aria-invalid={failed?.fieldErrors?.email ? true : undefined}
          aria-describedby={failed?.fieldErrors?.email ? "email-error" : undefined}
          className={inputClass}
        />
        {failed?.fieldErrors?.email && (
          <p id="email-error" className="mt-1 text-sm text-red-700 dark:text-red-400">
            {failed.fieldErrors.email}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={failed?.fieldErrors?.password ? true : undefined}
          aria-describedby={failed?.fieldErrors?.password ? "password-error" : undefined}
          className={inputClass}
        />
        {failed?.fieldErrors?.password && (
          <p id="password-error" className="mt-1 text-sm text-red-700 dark:text-red-400">
            {failed.fieldErrors.password}
          </p>
        )}
      </div>
      {failed?.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {failed.error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" name="intent" value="signIn" disabled={pending} className={buttonClass}>
          Entrar
        </button>
        <button type="submit" name="intent" value="signUp" disabled={pending} className={buttonClass}>
          Crear cuenta
        </button>
      </div>
    </form>
  );
}
