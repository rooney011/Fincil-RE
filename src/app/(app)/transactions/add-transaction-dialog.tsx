"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Loader } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addTransaction } from "./actions";
import { CATEGORIES, type Category } from "./constants";

type Direction = "expense" | "income";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function AddTransactionDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [direction, setDirection] = useState<Direction>("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("food");
  const [occurredAt, setOccurredAt] = useState(todayIsoDate);

  function reset() {
    setDirection("expense");
    setDescription("");
    setAmount("");
    setCategory("food");
    setOccurredAt(todayIsoDate());
  }

  function submit() {
    const num = Number.parseFloat(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    if (description.trim().length === 0) {
      toast.error("Description is required.");
      return;
    }
    const signedAmount = direction === "expense" ? -num : num;

    startTransition(async () => {
      const result = await addTransaction({
        description: description.trim(),
        amount: signedAmount,
        category,
        occurred_at: occurredAt,
      });

      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Transaction added");
        reset();
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            Add transaction
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>
            Log an expense or income. The Council uses it to ground its advice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs
            value={direction}
            onValueChange={(v) => setDirection(v as Direction)}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="expense">Expense</TabsTrigger>
              <TabsTrigger value="income">Income</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="What was it for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="occurred_at">Date</Label>
              <Input
                id="occurred_at"
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as Category)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button
            onClick={submit}
            disabled={pending || description.trim().length === 0 || !amount}
          >
            {pending && <Loader className="size-4 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
