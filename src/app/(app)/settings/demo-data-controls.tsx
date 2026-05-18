"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { seedDemoData, resetDemoData } from "@/app/onboarding/demo-actions";

type Props = {
  totalTransactions: number;
  demoTransactions: number;
};

export function DemoDataControls({ totalTransactions, demoTransactions }: Props) {
  const router = useRouter();
  const [seedPending, startSeed] = useTransition();
  const [resetPending, startReset] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const hasDemo = demoTransactions > 0;
  const canSeed = totalTransactions === 0;

  function load() {
    startSeed(async () => {
      const result = await seedDemoData();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Loaded ${result.inserted} sample transactions.`);
      router.refresh();
    });
  }

  function reset() {
    startReset(async () => {
      const result = await resetDemoData();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Demo data cleared.");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Sample data</h3>
          <p className="text-xs text-muted-foreground">
            Plausible 60-day spending history the Council can reason about. Only
            the rows seeded by Fincil are deleted on reset — anything you typed
            yourself stays.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <Button
            variant="outline"
            onClick={load}
            disabled={!canSeed || seedPending}
            title={canSeed ? undefined : "Your account already has transactions."}
          >
            {seedPending ? (
              <Loader className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Load sample data
          </Button>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger
              render={
                <Button
                  variant="destructive"
                  disabled={!hasDemo || resetPending}
                  title={hasDemo ? undefined : "No demo data to reset."}
                >
                  <Trash2 className="size-4" />
                  Reset demo data
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Reset demo data?</DialogTitle>
                <DialogDescription>
                  This deletes the sample transactions and goals that were
                  seeded. Anything you logged yourself is untouched.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setConfirmOpen(false)}
                  disabled={resetPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={reset}
                  disabled={resetPending}
                >
                  {resetPending && <Loader className="size-4 animate-spin" />}
                  Delete sample data
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {hasDemo && (
            <span className="text-xs text-muted-foreground ml-auto">
              {demoTransactions} sample transaction
              {demoTransactions === 1 ? "" : "s"} on file
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
