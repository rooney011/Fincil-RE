import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Scale, ShieldCheck, Sparkles, Gavel } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { features } from "@/lib/env";
import { loadPublicSession, type SharedTurn } from "./loader";

export const runtime = "nodejs";

type Props = { params: Promise<{ sessionId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!features.share) return { title: "Not found — Fincil" };
  const { sessionId } = await params;
  const debate = await loadPublicSession(sessionId);
  if (!debate) {
    return { title: "Debate not found — Fincil" };
  }
  const verdictWord =
    debate.verdict === "approved"
      ? "Approved"
      : debate.verdict === "rejected"
        ? "Rejected"
        : "Pending";
  const title = `${verdictWord}: ${debate.query} — Fincil Council`;
  const description = `The Council weighed ${formatCurrency(debate.amount)} on "${debate.query}". ${debate.finance.mathVerdict}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

const SAFETY_TONE: Record<
  Awaited<ReturnType<typeof loadPublicSession>> extends infer T
    ? T extends { finance: { safety: infer S } }
      ? S extends string
        ? S
        : never
      : never
    : never,
  string
> = {
  trivial: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  cash: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  "safe-emi": "bg-sky-500/10 text-sky-300 border-sky-500/20",
  risky: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  dangerous: "bg-red-500/10 text-red-300 border-red-500/20",
  deferred: "bg-red-500/10 text-red-300 border-red-500/20",
};

export default async function SharePage({ params }: Props) {
  if (!features.share) notFound();
  const { sessionId } = await params;
  const debate = await loadPublicSession(sessionId);
  if (!debate) notFound();

  const approved = debate.verdict === "approved";
  const dateLabel = new Date(debate.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Gavel className="size-4" />
            <span className="text-sm font-medium">Fincil Council</span>
          </Link>
          <Link
            href="/sign-up"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Try your own →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <section className="space-y-3">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] uppercase tracking-wider",
              approved
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                : "bg-red-500/10 text-red-300 border-red-500/20",
            )}
          >
            {approved ? "Verdict: Approved" : "Verdict: Rejected"}
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
            {debate.query}
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">
              {formatCurrency(debate.amount)}
            </span>
            {debate.category && (
              <>
                {" "}
                · <span className="capitalize">{debate.category}</span>
              </>
            )}{" "}
            · {dateLabel}
            {debate.appealedRounds > 0 && (
              <> · appealed {debate.appealedRounds}×</>
            )}
          </p>
        </section>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Scale className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">The math</h2>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "capitalize",
                  SAFETY_TONE[debate.finance.safety],
                )}
              >
                {debate.finance.safety.replace("-", " ")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {debate.finance.mathVerdict}
            </p>
          </CardContent>
        </Card>

        <section className="space-y-3">
          {debate.transcript.map((turn, i) => (
            <ShareTurnBubble key={i} turn={turn} />
          ))}
        </section>

        <Card
          className={cn(
            approved
              ? "ring-emerald-500/30 bg-emerald-500/5"
              : "ring-red-500/30 bg-red-500/5",
          )}
        >
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center gap-2">
              {approved ? (
                <CheckCircle2 className="size-5 text-emerald-300" />
              ) : (
                <XCircle className="size-5 text-red-300" />
              )}
              <h3
                className={cn(
                  "text-base font-semibold",
                  approved ? "text-emerald-300" : "text-red-300",
                )}
              >
                The Twin&apos;s verdict: {approved ? "Approved" : "Rejected"}
              </h3>
            </div>
            <p className="text-sm leading-relaxed">
              {debate.reasoning ??
                "Reasoning not captured for this legacy debate."}
            </p>
          </CardContent>
        </Card>

        <section className="rounded-lg border border-dashed border-border p-5 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Want one of your own? The Council weighs your purchases against
            real spending and goals.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try Fincil free
          </Link>
        </section>

        <p className="text-xs text-muted-foreground text-center pt-4">
          Shared anonymously. This is a thinking aid, not financial advice.
        </p>
      </main>
    </div>
  );
}

function ShareTurnBubble({ turn }: { turn: SharedTurn }) {
  const isMiser = turn.agent === "miser";
  return (
    <Card>
      <CardContent className="p-5 space-y-2">
        <div className="flex items-center gap-2">
          {isMiser ? (
            <ShieldCheck className="size-4 text-slate-300" />
          ) : (
            <Sparkles className="size-4 text-amber-300" />
          )}
          <h3
            className={cn(
              "text-sm font-medium",
              isMiser ? "text-slate-300" : "text-amber-300",
            )}
          >
            {isMiser ? "The Miser" : "The Visionary"}
          </h3>
          <span className="text-xs text-muted-foreground">
            Round {turn.round}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {turn.content}
        </p>
      </CardContent>
    </Card>
  );
}
