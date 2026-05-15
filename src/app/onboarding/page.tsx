import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  // If a profile already exists, this user has already onboarded — send them in.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) redirect("/dashboard");

  return (
    <div className="min-h-screen grid place-items-center px-6 py-12">
      <OnboardingWizard />
    </div>
  );
}
