"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Props = {
  email: string;
  displayName: string | null;
};

export function Topbar({ email, displayName }: Props) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  function goToSettings() {
    router.push("/settings");
  }

  const initial = (displayName ?? email).charAt(0).toUpperCase();

  return (
    <header className="h-14 shrink-0 border-b border-border flex items-center justify-end px-6 gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "h-9 px-2 gap-2 rounded-full",
          )}
        >
          <span className="size-7 rounded-full bg-primary/15 border border-primary/30 grid place-items-center text-primary text-xs font-semibold">
            {initial}
          </span>
          <span className="text-sm hidden sm:inline">
            {displayName ?? email}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm">{displayName ?? "Signed in"}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {email}
                </span>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={goToSettings} className="cursor-pointer">
            <UserIcon className="size-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={signOut} className="cursor-pointer">
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
