"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Plus,
  Loader,
  Trash2,
  RotateCcw,
  Check,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatCurrency } from "@/lib/utils";
import {
  contributeToGoal,
  deleteGoal,
  setGoalStatus,
} from "./actions";
import {
  type Goal,
  PRIORITY_TONE,
  STATUS_TONE,
} from "./constants";

export function GoalCard({
  goal,
  daysLeft,
}: {
  goal: Goal;
  // Computed server-side and passed in so we don't call Date.now() during render
  // (React 19 purity rule). Resolution is day-level so per-navigation freshness
  // is sufficient.
  daysLeft: number | null;
}) {
  const [contributing, setContributing] = useState(false);
  const [contributeAmount, setContributeAmount] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);
  const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);

  function doContribute() {
    const num = Number.parseFloat(contributeAmount);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    startTransition(async () => {
      const result = await contributeToGoal({ id: goal.id, delta: num });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.achieved) {
        toast.success("Target met! Goal marked done.");
      } else {
        toast.success(
          `Added ${formatCurrency(num)} — now at ${formatCurrency(result.newCurrent)}.`,
        );
      }
      setContributeAmount("");
      setContributing(false);
    });
  }

  function doSetStatus(status: Goal["status"]) {
    startTransition(async () => {
      const result = await setGoalStatus({ id: goal.id, status });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Goal marked ${status}.`);
    });
  }

  function doDelete() {
    startTransition(async () => {
      const result = await deleteGoal(goal.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Goal deleted.");
      setShowDelete(false);
    });
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-sm font-medium truncate">{goal.name}</h3>
              <Badge
                variant="outline"
                className={cn("capitalize text-[10px]", STATUS_TONE[goal.status])}
              >
                {goal.status}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "capitalize text-[10px]",
                  PRIORITY_TONE[goal.priority],
                )}
              >
                {goal.priority} priority
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {daysLeft === null
                ? "No target date"
                : daysLeft < 0
                  ? `${Math.abs(daysLeft)} days past due`
                  : daysLeft === 0
                    ? "Due today"
                    : `${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining`}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Goal actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {goal.status === "active" ? (
                <DropdownMenuItem onClick={() => doSetStatus("done")}>
                  <Check className="size-3.5" />
                  Mark done
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => doSetStatus("active")}>
                  <RotateCcw className="size-3.5" />
                  Reopen
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowDelete(true)}>
                <Trash2 className="size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                goal.status === "done" ? "bg-emerald-400" : "bg-primary",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono tabular-nums">
              {formatCurrency(current)}{" "}
              <span className="text-muted-foreground">
                / {formatCurrency(target)}
              </span>
            </span>
            <span className="text-muted-foreground">
              {Math.round(progress)}% • {formatCurrency(remaining)} to go
            </span>
          </div>
        </div>

        {goal.status === "active" && (
          <div className="pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setContributing(true)}
              disabled={pending}
            >
              <Plus className="size-3.5" />
              Contribute
            </Button>
          </div>
        )}
      </CardContent>

      {/* Contribute dialog */}
      <Dialog open={contributing} onOpenChange={setContributing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contribute to {goal.name}</DialogTitle>
            <DialogDescription>
              How much did you put aside? We&apos;ll add it to the current total.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`contribute-${goal.id}`}>Amount (₹)</Label>
            <Input
              id={`contribute-${goal.id}`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0"
              value={contributeAmount}
              onChange={(e) => setContributeAmount(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setContributing(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={doContribute} disabled={pending || !contributeAmount}>
              {pending && <Loader className="size-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this goal?</DialogTitle>
            <DialogDescription>
              {goal.name} — {formatCurrency(current)} / {formatCurrency(target)}.
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDelete(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={pending}>
              {pending && <Loader className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
