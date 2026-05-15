"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Loader } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createGoal } from "./actions";
import { PRIORITIES, type Priority } from "./constants";

export function AddGoalDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  function reset() {
    setName("");
    setTarget("");
    setCurrent("");
    setTargetDate("");
    setPriority("medium");
  }

  function submit() {
    const targetNum = Number.parseFloat(target);
    if (name.trim().length === 0) {
      toast.error("Give the goal a name.");
      return;
    }
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      toast.error("Enter a positive target.");
      return;
    }
    const currentNum = current ? Number.parseFloat(current) : 0;
    if (!Number.isFinite(currentNum) || currentNum < 0) {
      toast.error("Current amount must be zero or more.");
      return;
    }

    startTransition(async () => {
      const result = await createGoal({
        name: name.trim(),
        target_amount: targetNum,
        current_amount: currentNum,
        target_date: targetDate || undefined,
        priority,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Goal created.");
      reset();
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            Add goal
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New savings goal</DialogTitle>
          <DialogDescription>
            The Council will weigh future purchases against your active goals.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal-name">Name</Label>
            <Input
              id="goal-name"
              placeholder="e.g. Emergency fund, MacBook, Down payment"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="goal-target">Target (₹)</Label>
              <Input
                id="goal-target"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-current">
                Already saved{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="goal-current"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="goal-date">
                Target date{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="goal-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as Priority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim() || !target}>
            {pending && <Loader className="size-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
