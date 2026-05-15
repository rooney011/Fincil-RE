import { Suspense } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to consult the Council.
        </p>
      </div>

      <Suspense fallback={<SignInFallback />}>
        <SignInForm />
      </Suspense>

      <p className="text-sm text-muted-foreground text-center">
        New here?{" "}
        <Link
          href="/sign-up"
          className="text-foreground hover:text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

function SignInFallback() {
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
