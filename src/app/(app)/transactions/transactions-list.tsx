"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Loader } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatCurrency } from "@/lib/utils";
import { deleteTransaction } from "./actions";

export type ListTransaction = {
  id: string;
  description: string;
  amount: number;
  category: string;
  source: "manual" | "council" | "adjustment";
  occurred_at: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  food: "bg-amber-500/10 text-amber-300",
  transport: "bg-sky-500/10 text-sky-300",
  shopping: "bg-pink-500/10 text-pink-300",
  bills: "bg-red-500/10 text-red-300",
  entertainment: "bg-violet-500/10 text-violet-300",
  health: "bg-rose-500/10 text-rose-300",
  education: "bg-emerald-500/10 text-emerald-300",
  travel: "bg-cyan-500/10 text-cyan-300",
  subscription: "bg-fuchsia-500/10 text-fuchsia-300",
  salary: "bg-emerald-500/10 text-emerald-300",
  gift: "bg-yellow-500/10 text-yellow-300",
  refund: "bg-teal-500/10 text-teal-300",
  other: "bg-zinc-500/10 text-zinc-300",
};

const SOURCE_LABELS: Record<ListTransaction["source"], string> = {
  manual: "Manual",
  council: "Council",
  adjustment: "Adjustment",
};

export function TransactionsList({
  transactions,
}: {
  transactions: ListTransaction[];
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const txToDelete = transactions.find((t) => t.id === confirmId) ?? null;

  function confirmDelete() {
    if (!confirmId) return;
    startTransition(async () => {
      const result = await deleteTransaction(confirmId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Transaction deleted");
        setConfirmId(null);
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {transactions.map((tx) => {
            const isOutflow = tx.amount < 0;
            return (
              <li
                key={tx.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-medium text-sm truncate">
                      {tx.description}
                    </p>
                    <Badge
                      className={cn(
                        "capitalize border-transparent",
                        CATEGORY_COLORS[tx.category] ?? CATEGORY_COLORS.other,
                      )}
                    >
                      {tx.category}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-wider"
                    >
                      {SOURCE_LABELS[tx.source]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.occurred_at).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <p
                  className={cn(
                    "font-mono font-medium tabular-nums shrink-0 text-sm",
                    isOutflow ? "text-foreground" : "text-emerald-300",
                  )}
                >
                  {isOutflow ? "−" : "+"}
                  {formatCurrency(Math.abs(tx.amount))}
                </p>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setConfirmId(tx.id)}
                  aria-label="Delete transaction"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>

      <Dialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this transaction?</DialogTitle>
            <DialogDescription>
              {txToDelete && (
                <>
                  {txToDelete.description} —{" "}
                  {formatCurrency(Math.abs(txToDelete.amount))}. This cannot be
                  undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmId(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending && <Loader className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
