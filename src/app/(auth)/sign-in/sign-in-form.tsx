"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader, Mail, Inbox, ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function SignInForm() {
  const search = useSearchParams();
  const next = search.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    setLoading(true);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });

    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSentTo(cleanEmail);
  }

  if (sentTo) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4 text-center">
          <div className="size-10 rounded-full bg-primary/10 text-primary grid place-items-center mx-auto">
            <Inbox className="size-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-medium">Check your inbox</h2>
            <p className="text-sm text-muted-foreground">
              We sent a sign-in link to{" "}
              <span className="text-foreground">{sentTo}</span>. Click it on
              this device and you&apos;ll land back here, signed in.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSentTo(null);
              setEmail("");
            }}
          >
            <ArrowLeft className="size-3.5" />
            Use a different email
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll send a one-time link. No passwords to forget.
            </p>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading || email.trim().length === 0}
          >
            {loading ? (
              <Loader className="size-4 animate-spin" />
            ) : (
              <Mail className="size-4" />
            )}
            Send sign-in link
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
