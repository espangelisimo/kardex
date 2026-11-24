import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 px-4 py-3 dark:border-white/20">
        <span className="font-semibold">Kardex</span>
        <div className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 truncate text-sm">{user.email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded border border-black/20 px-3 py-1.5 text-sm hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/30 dark:hover:bg-white/10"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
