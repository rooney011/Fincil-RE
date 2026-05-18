import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link callback. Supabase emails the user a link to
 *   /auth/callback?code=<otp_token>&next=<destination>
 * We exchange the code for a session cookie, then redirect to `next` (default
 * /dashboard). Middleware then routes to /onboarding if the profile is
 * missing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  // Only allow same-origin relative paths in `next` so an attacker can't
  // turn the callback into an open redirect via a crafted email link.
  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${url.origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${url.origin}/sign-in?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${url.origin}${safeNext}`);
}
