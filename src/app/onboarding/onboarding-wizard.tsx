"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader,
  Sparkles,
  PencilLine,
} from "lucide-react";

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
import { seedDemoData } from "./demo-actions";

const ROLES = [
  { value: "student", label: "Student" },
  { value: "freelancer", label: "Freelancer" },
  { value: "employee", label: "Employee" },
  { value: "business", label: "Business owner" },
  { value: "general", label: "Other" },
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
  { title: "Get started", hint: "Pick how you want to fill in your data." },
] as const;

type Step = 0 | 1 | 2 | 3;

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState<OnboardingInput>({
    display_name: "",
    role: "student",
    monthly_income: 0,
    monthly_expenses: 0,
    financial_goal: "",
    risk_tolerance: "medium",
  });
  const [savePending, startSave] = useTransition();
  const [seedPending, startSeed] = useTransition();
  const [skipPending, startSkip] = useTransition();

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
    setStep((s) => Math.min(3, s + 1) as Step);
  }

  function back() {
    setStep((s) => Math.max(0, s - 1) as Step);
  }

  function saveProfile() {
    startSave(async () => {
      const result = await completeOnboarding(form);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setStep(3);
    });
  }

  function startWithDemo() {
    startSeed(async () => {
      const result = await seedDemoData();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Loaded ${result.inserted} sample transactions.`);
      router.push("/dashboard");
    });
  }

  function startManual() {
    startSkip(() => {
      router.push("/transactions");
    });
  }

  const isLastFormStep = step === 2;
  const anyPending = savePending || seedPending || skipPending;

  return (
    <div className="w-full max-w-lg space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your profile
        </h1>
        <p className="text-sm text-muted-foreground">
          A few quick steps. The Council uses this to brief itself.
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

          {step === 3 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={startWithDemo}
                disabled={anyPending}
                className={cn(
                  "w-full text-left rounded-lg border border-border p-4 transition-colors",
                  "hover:border-primary hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-primary/10 p-2">
                    {seedPending ? (
                      <Loader className="size-4 animate-spin text-primary" />
                    ) : (
                      <Sparkles className="size-4 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Try with sample data</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Recommended
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Seed ~60 days of plausible spending and two active goals
                      so the Council has something to ground its debate in. You
                      can reset it from Settings anytime.
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={startManual}
                disabled={anyPending}
                className={cn(
                  "w-full text-left rounded-lg border border-border p-4 transition-colors",
                  "hover:border-primary hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-muted p-2">
                    {skipPending ? (
                      <Loader className="size-4 animate-spin" />
                    ) : (
                      <PencilLine className="size-4" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="font-medium">I&apos;ll add my own</span>
                    <p className="text-xs text-muted-foreground">
                      Skip the sample data and go straight to Transactions to
                      log a few. The Council works best with at least 10–15
                      entries.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {step < 3 && (
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={back}
            disabled={step === 0 || savePending}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>

          {isLastFormStep ? (
            <Button type="button" onClick={saveProfile} disabled={savePending}>
              {savePending ? (
                <Loader className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Save & continue
            </Button>
          ) : (
            <Button type="button" onClick={next} disabled={!canAdvance()}>
              Next
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      )}
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
            "h-1.5 w-10 rounded-full transition-colors",
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
