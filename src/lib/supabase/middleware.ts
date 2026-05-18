import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { Database } from "@/lib/db/types";

/**
 * Refresh the Supabase session on every request and gate authed routes.
 *
 * Auth routing rules:
 *   - Unauthed user hitting an /(app) route       → redirect to /sign-in
 *   - Authed user hitting /(auth) or /            → redirect to /dashboard
 *   - Authed user without a profile              → redirect to /onboarding
 *   - Unauthed user hitting /(auth) or /         → allow
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() (not getSession) — this revalidates the JWT.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute =
    pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const isAuthCallback = pathname.startsWith("/auth/callback");
  const isOnboarding = pathname.startsWith("/onboarding");
  const isShare = pathname.startsWith("/share");
  const isPublic =
    pathname === "/" || isAuthRoute || isShare || isAuthCallback;

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // /share/* and /auth/callback are always pass-through — public access never
  // gated, and the callback must run regardless of session state.
  if (isShare || isAuthCallback) return response;

  // Profile gate: authed user without a profile row gets pushed to onboarding.
  if (user && !isOnboarding && !isAuthRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile && pathname !== "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
