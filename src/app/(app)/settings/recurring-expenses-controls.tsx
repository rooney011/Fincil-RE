"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { recalculateExpenses } from "./actions";

export type ActiveCommitment = {
  id: string;
  monthly_amount: number;
  started_at: string; // YYYY-MM-DD
  expires_at: string; // YYYY-MM-DD
};

export function RecurringExpensesControls({
  baseline,
  cachedTotal,
  commitments,
}: {
  baseline: number;
  cachedTotal: number;
  commitments: ActiveCommitment[];
}) {
  const [pending, start] = useTransition();
  const activeSum = commitments.reduce((s, c) => s + c.monthly_amount, 0);
  const expectedTotal = baseline + activeSum;
  const drift = cachedTotal - expectedTotal;

  function doRecalc() {
    start(async () => {
      const result = await recalculateExpenses();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Recurring expenses recalculated to ${formatCurrency(result.total)}.`,
      );
    });
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-medium">Recurring expenses</h3>
            <p className="text-xs text-muted-foreground">
              Your baseline plus every active EMI the Council has logged for
              you. Commitments auto-expire 12 months after they were accepted.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={doRecalc}
            disabled={pending}
          >
            {pending ? (
              <Loader className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Recalculate
          </Button>
        </div>

        <dl className="grid grid-cols-3 gap-3 pt-1">
          <Stat label="Baseline" value={formatCurrency(baseline)} />
          <Stat
            label={`Active EMIs (${commitments.length})`}
            value={formatCurrency(activeSum)}
          />
          <Stat label="Total / month" value={formatCurrency(expectedTotal)} />
        </dl>

        {Math.abs(drift) > 0.5 && (
          <p className="text-xs text-amber-300">
            Cached total ({formatCurrency(cachedTotal)}) differs from the
            expected ({formatCurrency(expectedTotal)}). Click Recalculate to
            sync.
          </p>
        )}

        {commitments.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Active commitments
            </p>
            <ul className="space-y-1.5">
              {commitments.map((c) => (
                <CommitmentRow key={c.id} commitment={c} />
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CommitmentRow({ commitment }: { commitment: ActiveCommitment }) {
  const expiresAt = new Date(commitment.expires_at);
  const today = new Date();
  const monthsRemaining = Math.max(
    0,
    Math.round(
      (expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30),
    ),
  );
  const startedLabel = new Date(commitment.started_at).toLocaleDateString(
    "en-IN",
    { day: "numeric", month: "short", year: "numeric" },
  );

  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-mono tabular-nums">
          {formatCurrency(commitment.monthly_amount)}/mo
        </p>
        <p className="text-xs text-muted-foreground">Started {startedLabel}</p>
      </div>
      <Badge variant="outline" className="text-[10px]">
        {monthsRemaining} mo left
      </Badge>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
