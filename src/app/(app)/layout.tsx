import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  // Profile must exist; middleware enforces this but we double-check here for the type.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle<{ display_name: string | null }>();

  if (!profile) redirect("/onboarding");

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          email={user.email ?? ""}
          displayName={profile.display_name}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1280px] mx-auto px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
