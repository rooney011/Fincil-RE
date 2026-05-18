"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader, Sparkles, Plus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { seedDemoData } from "@/app/onboarding/demo-actions";

export function ColdStartBanner() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function load() {
    start(async () => {
      const result = await seedDemoData();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Loaded ${result.inserted} sample transactions.`);
      router.refresh();
    });
  }

  return (
    <Card className="border-dashed">
      <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="rounded-md bg-primary/10 p-3 self-start">
          <Sparkles className="size-5 text-primary" />
        </div>
        <div className="flex-1 space-y-1">
          <h3 className="text-sm font-medium">Let&apos;s get the Council something to chew on</h3>
          <p className="text-xs text-muted-foreground">
            The personas debate sharper when they have spending history to cite.
            Seed ~60 days of sample data, or add your first transaction.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/transactions"
            className={cn(buttonVariants({ variant: "outline" }), "h-9")}
          >
            <Plus className="size-4" />
            Add a transaction
          </Link>
          <Button onClick={load} disabled={pending} className="h-9">
            {pending ? (
              <Loader className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Try with sample data
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
