"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { updateProfile, type UpdateProfileInput } from "./actions";

const ROLES = [
  { value: "student", label: "Student" },
  { value: "freelancer", label: "Freelancer" },
  { value: "employee", label: "Employee" },
  { value: "business", label: "Business owner" },
  { value: "general", label: "Other" },
] as const;

const RISKS = [
  { value: "low", label: "Low — protect what I have" },
  { value: "medium", label: "Medium — balanced" },
  { value: "high", label: "High — open to risk" },
] as const;

export function SettingsForm({
  initial,
  activeCommitmentsTotal,
  activeCommitmentsCount,
}: {
  initial: UpdateProfileInput;
  activeCommitmentsTotal: number;
  activeCommitmentsCount: number;
}) {
  const [form, setForm] = useState<UpdateProfileInput>(initial);
  const [pending, startTransition] = useTransition();

  function setField<K extends keyof UpdateProfileInput>(
    key: K,
    value: UpdateProfileInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    if (form.display_name.trim().length === 0) {
      toast.error("Display name is required.");
      return;
    }
    if (form.monthly_income < 0 || form.baseline_monthly_expenses < 0) {
      toast.error("Income and expenses must be zero or more.");
      return;
    }

    startTransition(async () => {
      const result = await updateProfile(form);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile saved.");
    });
  }

  const computedTotal =
    Number(form.baseline_monthly_expenses) + activeCommitmentsTotal;

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="display_name">Display name</Label>
          <Input
            id="display_name"
            value={form.display_name}
            onChange={(e) => setField("display_name", e.target.value)}
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select
            value={form.role}
            onValueChange={(v) =>
              setField("role", v as UpdateProfileInput["role"])
            }
            disabled={pending}
          >
            <SelectTrigger className="w-full md:w-1/2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="monthly_income">Monthly income (₹)</Label>
            <Input
              id="monthly_income"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={
                form.monthly_income === 0 ? "" : String(form.monthly_income)
              }
              onChange={(e) =>
                setField(
                  "monthly_income",
                  e.target.value === ""
                    ? 0
                    : Number.parseFloat(e.target.value) || 0,
                )
              }
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="baseline_monthly_expenses">
              Monthly expenses — baseline (₹)
            </Label>
            <Input
              id="baseline_monthly_expenses"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={
                form.baseline_monthly_expenses === 0
                  ? ""
                  : String(form.baseline_monthly_expenses)
              }
              onChange={(e) =>
                setField(
                  "baseline_monthly_expenses",
                  e.target.value === ""
                    ? 0
                    : Number.parseFloat(e.target.value) || 0,
                )
              }
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              Your recurring outflow before any Council EMIs. Active
              commitments
              {activeCommitmentsCount > 0
                ? ` (${activeCommitmentsCount}: ${formatCurrency(activeCommitmentsTotal)}/mo)`
                : ""}{" "}
              are added automatically — total{" "}
              <span className="text-foreground font-mono tabular-nums">
                {formatCurrency(computedTotal)}/mo
              </span>
              .
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="risk_tolerance">Risk tolerance</Label>
          <Select
            value={form.risk_tolerance}
            onValueChange={(v) =>
              setField(
                "risk_tolerance",
                v as UpdateProfileInput["risk_tolerance"],
              )
            }
            disabled={pending}
          >
            <SelectTrigger className="w-full md:w-1/2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RISKS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="financial_goal">
            Financial goal{" "}
            <span className="text-xs text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Textarea
            id="financial_goal"
            rows={3}
            value={form.financial_goal}
            onChange={(e) => setField("financial_goal", e.target.value)}
            disabled={pending}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button onClick={submit} disabled={pending}>
            {pending ? (
              <Loader className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
