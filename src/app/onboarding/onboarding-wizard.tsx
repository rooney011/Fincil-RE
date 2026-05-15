"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { completeOnboarding, type OnboardingInput } from "./actions";

const ROLES = [
  { value: "student", label: "Student" },
  { value: "freelancer", label: "Freelancer" },
  { value: "employee", label: "Employee" },
  { value: "business", label: "Business owner" },
  { value: "general", label: "Other" },
] as const;

const INCOME_TYPES = [
  { value: "fixed", label: "Fixed — same amount each month" },
  { value: "variable", label: "Variable — changes month to month" },
] as const;

const RISK_LEVELS = [
  { value: "low", label: "Low — protect what I have" },
  { value: "medium", label: "Medium — balanced" },
  { value: "high", label: "High — open to risk" },
] as const;

const STEPS = [
  { title: "About you", hint: "Just the basics." },
  { title: "Money", hint: "Rough monthly numbers, ₹." },
  { title: "Direction", hint: "Risk appetite and a goal, if any." },
] as const;

type Step = 0 | 1 | 2;

export function OnboardingWizard() {
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState<OnboardingInput>({
    display_name: "",
    role: "student",
    monthly_income: 0,
    monthly_expenses: 0,
    income_type: "fixed",
    financial_goal: "",
    risk_tolerance: "medium",
  });
  const [pending, startTransition] = useTransition();

  function setField<K extends keyof OnboardingInput>(
    key: K,
    value: OnboardingInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function canAdvance(): boolean {
    if (step === 0) return form.display_name.trim().length > 0;
    if (step === 1) {
      return (
        Number.isFinite(form.monthly_income) &&
        form.monthly_income >= 0 &&
        Number.isFinite(form.monthly_expenses) &&
        form.monthly_expenses >= 0
      );
    }
    return true;
  }

  function next() {
    if (!canAdvance()) return;
    setStep((s) => Math.min(2, s + 1) as Step);
  }

  function back() {
    setStep((s) => Math.max(0, s - 1) as Step);
  }

  function submit() {
    startTransition(async () => {
      const result = await completeOnboarding(form);
      if (result?.error) toast.error(result.error);
    });
  }

  const isLast = step === 2;

  return (
    <div className="w-full max-w-lg space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your profile
        </h1>
        <p className="text-sm text-muted-foreground">
          Three quick steps. The Council uses this to brief itself.
        </p>
      </div>

      <Stepper current={step} />

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-medium">{STEPS[step].title}</h2>
            <p className="text-xs text-muted-foreground">{STEPS[step].hint}</p>
          </div>

          {step === 0 && (
            <div className="space-y-4">
              <Field id="display_name" label="Display name">
                <Input
                  id="display_name"
                  autoComplete="nickname"
                  placeholder="What should we call you?"
                  value={form.display_name}
                  onChange={(e) => setField("display_name", e.target.value)}
                />
              </Field>
              <Field id="role" label="What best describes you?">
                <Select
                  value={form.role}
                  onValueChange={(v) =>
                    setField("role", v as OnboardingInput["role"])
                  }
                >
                  <SelectTrigger className="w-full">
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
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Field id="monthly_income" label="Monthly income (₹)">
                <Input
                  id="monthly_income"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="0"
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
                />
              </Field>
              <Field id="monthly_expenses" label="Monthly expenses (₹)">
                <Input
                  id="monthly_expenses"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={
                    form.monthly_expenses === 0
                      ? ""
                      : String(form.monthly_expenses)
                  }
                  onChange={(e) =>
                    setField(
                      "monthly_expenses",
                      e.target.value === ""
                        ? 0
                        : Number.parseFloat(e.target.value) || 0,
                    )
                  }
                />
              </Field>
              <Field id="income_type" label="Income type">
                <Select
                  value={form.income_type}
                  onValueChange={(v) =>
                    setField(
                      "income_type",
                      v as OnboardingInput["income_type"],
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INCOME_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Field id="risk_tolerance" label="Risk tolerance">
                <Select
                  value={form.risk_tolerance}
                  onValueChange={(v) =>
                    setField(
                      "risk_tolerance",
                      v as OnboardingInput["risk_tolerance"],
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                id="financial_goal"
                label="A goal you'd like the Council to know about"
                optional
              >
                <Textarea
                  id="financial_goal"
                  placeholder="e.g. Save ₹2 lakh for a laptop by December"
                  rows={3}
                  value={form.financial_goal}
                  onChange={(e) => setField("financial_goal", e.target.value)}
                />
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={back}
          disabled={step === 0 || pending}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        {isLast ? (
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? (
              <Loader className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Finish
          </Button>
        ) : (
          <Button type="button" onClick={next} disabled={!canAdvance()}>
            Next
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map((s, i) => (
        <div
          key={s.title}
          className={cn(
            "h-1.5 w-12 rounded-full transition-colors",
            i <= current ? "bg-primary" : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

function Field({
  id,
  label,
  optional,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-2">
        <span>{label}</span>
        {optional && (
          <span className="text-xs text-muted-foreground font-normal">
            (optional)
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}
