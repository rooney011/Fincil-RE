"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader } from "lucide-react";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (!data.session) {
      toast.success("Check your email to confirm your account.");
      return;
    }

    router.push("/onboarding");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your Council
        </h1>
        <p className="text-sm text-muted-foreground">
          Three personas, your transactions, better decisions.
        </p>
      </div>

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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                At least 8 characters.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader className="size-4 animate-spin" />}
              Create account
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground text-center">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="text-foreground hover:text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
