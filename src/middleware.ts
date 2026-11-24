import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

type CookieOptions = Parameters<NextResponse["cookies"]["set"]>[2];

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.",
    );
  }

  let response = NextResponse.next({ request });
  // Cookies y cabeceras anti-caché que Supabase pide escribir al refrescar,
  // para copiarlas también a una eventual respuesta de redirección.
  let refreshed: {
    cookies: { name: string; value: string; options: CookieOptions }[];
    headers: Record<string, string>;
  } = { cookies: [], headers: {} };

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
        refreshed = { cookies: cookiesToSet, headers };
      },
    },
  });

  // getUser() revalida el token contra Supabase (S-07); getSession() no.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPrivate = path === "/app" || path.startsWith("/app/");
  let redirectTo: string | null = null;
  if (!user && isPrivate) redirectTo = "/login";
  else if (user && path === "/login") redirectTo = "/app";

  if (redirectTo) {
    const redirect = NextResponse.redirect(new URL(redirectTo, request.url));
    // Conserva la sesión refrescada en la respuesta de redirección.
    refreshed.cookies.forEach(({ name, value, options }) =>
      redirect.cookies.set(name, value, options),
    );
    Object.entries(refreshed.headers).forEach(([key, value]) =>
      redirect.headers.set(key, value),
    );
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
