import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SignInForm } from "../sign-in/sign-in-form";

export default function SignUpPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your Council
        </h1>
        <p className="text-sm text-muted-foreground">
          Three personas, your transactions, better decisions. Drop your email
          and we&apos;ll send a one-time link to start.
        </p>
      </div>

      <Suspense fallback={<SignUpFallback />}>
        <SignInForm />
      </Suspense>

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

function SignUpFallback() {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}
