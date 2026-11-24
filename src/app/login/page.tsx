import { AuthForm } from "./auth-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Kardex</h1>
        <p className="mt-1 text-sm opacity-80">
          Inventario por movimientos. Entra con tu cuenta o crea una nueva.
        </p>
      </div>
      <AuthForm />
    </main>
  );
}
