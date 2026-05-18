"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Gavel,
  Loader,
  CheckCircle2,
  XCircle,
  Scale,
  Sparkles,
  ShieldCheck,
  Check,
  X,
  MessageSquare,
} from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import { CATEGORIES, type Category } from "../transactions/constants";
import { StreamEventDecoder } from "@/lib/ai/stream-protocol";

type Turn = {
  agent: "miser" | "visionary";
  content: string;
  round: number;
};

type FinanceVerdictView = {
  surplus: number;
  estimatedEmi: number;
  emiImpactPercent: number;
  safety:
    | "trivial"
    | "cash"
    | "safe-emi"
    | "risky"
    | "dangerous"
    | "deferred";
  paymentMode: "cash" | "emi" | "deferred-loan";
  isEducation: boolean;
  mathVerdict: string;
};

type RoundView = {
  appealText: string | null; // null = original; set for appeal rounds
  financeVerdict: FinanceVerdictView | null;
  transcript: Turn[];
  verdict: "approved" | "rejected" | null;
  reasoning: string | null;
};

const SAFETY_TONE: Record<FinanceVerdictView["safety"], string> = {
  trivial: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  cash: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  "safe-emi": "bg-sky-500/10 text-sky-300 border-sky-500/20",
  risky: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  dangerous: "bg-red-500/10 text-red-300 border-red-500/20",
  deferred: "bg-red-500/10 text-red-300 border-red-500/20",
};

const MAX_APPEAL_ROUNDS = 5;

export function CouncilForm() {
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category | "">("");

  const [streaming, setStreaming] = useState(false);
  const [streamingTarget, setStreamingTarget] = useState<
    "original" | "appeal" | null
  >(null);

  // Original round + all appeals as a single chronological array.
  // Index 0 is the original; subsequent are appeal rounds.
  const [rounds, setRounds] = useState<RoundView[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [decided, setDecided] = useState<"accepted" | "declined" | null>(null);
  const [deciding, startDeciding] = useTransition();

  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealText, setAppealText] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  function resetAll() {
    setRounds([]);
    setSessionId(null);
    setDecided(null);
    setShowAppealForm(false);
    setAppealText("");
  }

  // Index into rounds that the active stream is updating. Avoids closure
  // staleness when handleEvent runs over many ticks.
  const activeRoundIdxRef = useRef<number>(-1);

  function pushChunkToActive(text: string) {
    setRounds((prev) => {
      const idx = activeRoundIdxRef.current;
      if (idx < 0 || idx >= prev.length) return prev;
      const round = prev[idx];
      if (round.transcript.length === 0) return prev;
      const lastTurn = round.transcript[round.transcript.length - 1];
      const newTurn = { ...lastTurn, content: lastTurn.content + text };
      const newTranscript = [...round.transcript.slice(0, -1), newTurn];
      return prev.map((r, i) =>
        i === idx ? { ...r, transcript: newTranscript } : r,
      );
    });
  }

  function pushTurnToActive(turn: Turn) {
    setRounds((prev) => {
      const idx = activeRoundIdxRef.current;
      if (idx < 0 || idx >= prev.length) return prev;
      return prev.map((r, i) =>
        i === idx ? { ...r, transcript: [...r.transcript, turn] } : r,
      );
    });
  }

  function setActiveMeta(financeVerdict: FinanceVerdictView) {
    setRounds((prev) => {
      const idx = activeRoundIdxRef.current;
      if (idx < 0 || idx >= prev.length) return prev;
      return prev.map((r, i) =>
        i === idx ? { ...r, financeVerdict } : r,
      );
    });
  }

  function setActiveVerdict(
    v: "approved" | "rejected",
    reasoning: string,
  ) {
    setRounds((prev) => {
      const idx = activeRoundIdxRef.current;
      if (idx < 0 || idx >= prev.length) return prev;
      return prev.map((r, i) =>
        i === idx ? { ...r, verdict: v, reasoning } : r,
      );
    });
  }

  function handleEvent(ev: {
    type: string;
    [k: string]: unknown;
  }): void {
    switch (ev.type) {
      case "meta":
        setActiveMeta(ev.financeVerdict as FinanceVerdictView);
        break;
      case "agent":
        pushTurnToActive({
          agent: ev.agent as "miser" | "visionary",
          round: ev.round as number,
          content: "",
        });
        break;
      case "chunk":
        pushChunkToActive(ev.text as string);
        break;
      case "verdict":
        setActiveVerdict(
          ev.verdict as "approved" | "rejected",
          ev.reasoning as string,
        );
        if (typeof ev.sessionId === "string") {
          setSessionId(ev.sessionId);
        }
        break;
      case "error":
        toast.error(String(ev.error ?? "Unknown stream error"));
        break;
    }
  }

  async function consumeStream(res: Response) {
    if (!res.body) throw new Error("No response body");
    const decoder = new StreamEventDecoder();
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        for (const ev of decoder.push(value)) handleEvent(ev);
      }
      if (done) {
        for (const ev of decoder.flush()) handleEvent(ev);
        break;
      }
    }
  }

  async function submitOriginal() {
    const num = Number.parseFloat(amount);
    if (query.trim().length === 0) {
      toast.error("Tell the Council what you want to buy.");
      return;
    }
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }

    resetAll();
    const newRound: RoundView = {
      appealText: null,
      financeVerdict: null,
      transcript: [],
      verdict: null,
      reasoning: null,
    };
    setRounds([newRound]);
    activeRoundIdxRef.current = 0;
    setStreaming(true);
    setStreamingTarget("original");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          amount: num,
          category: category || undefined,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? `Council error (${res.status})`);
        return;
      }
      await consumeStream(res);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        toast.error(
          e instanceof Error ? e.message : "Stream errored — try again.",
        );
      }
    } finally {
      setStreaming(false);
      setStreamingTarget(null);
    }
  }

  async function submitAppeal() {
    if (!sessionId) {
      toast.error("This debate wasn't saved, so it can't be appealed.");
      return;
    }
    if (appealText.trim().length === 0) {
      toast.error("Write something the Council didn't already hear.");
      return;
    }

    const textForRound = appealText.trim();
    const newRound: RoundView = {
      appealText: textForRound,
      financeVerdict: null,
      transcript: [],
      verdict: null,
      reasoning: null,
    };
    setRounds((prev) => {
      activeRoundIdxRef.current = prev.length;
      return [...prev, newRound];
    });
    setShowAppealForm(false);
    setAppealText("");
    setDecided(null); // re-open accept/decline on the new latest round
    setStreaming(true);
    setStreamingTarget("appeal");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, appealText: textForRound }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? `Appeal error (${res.status})`);
        return;
      }
      await consumeStream(res);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        toast.error(
          e instanceof Error ? e.message : "Appeal stream errored.",
        );
      }
    } finally {
      setStreaming(false);
      setStreamingTarget(null);
    }
  }

  function decide(action: "accept" | "decline") {
    if (!sessionId) {
      toast.error("This debate wasn't saved, so it can't be decided.");
      return;
    }
    startDeciding(async () => {
      try {
        const res = await fetch("/api/decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, action }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          decision?: "accepted" | "declined";
          error?: string;
          expensesBumped?: number | null;
        };
        if (!res.ok || !data.ok) {
          toast.error(data.error ?? `Decision failed (${res.status})`);
          return;
        }
        setDecided(
          data.decision ?? (action === "accept" ? "accepted" : "declined"),
        );
        if (data.decision === "accepted") {
          if (data.expensesBumped) {
            toast.success(
              `Logged. Monthly expenses bumped by ${formatCurrency(data.expensesBumped)} for the EMI.`,
            );
          } else {
            toast.success("Logged as a council transaction.");
          }
        } else {
          toast.success("Recorded as declined. No transaction logged.");
        }
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "Network error reaching /api/decide.",
        );
      }
    });
  }

  const latestRoundIdx = rounds.length - 1;
  const latestRound = rounds[latestRoundIdx];
  const hasAnyResults = rounds.length > 0;
  const canAppealAgain =
    rounds.length > 0 &&
    rounds.length < MAX_APPEAL_ROUNDS + 1 && // 1 original + 5 appeals
    !streaming &&
    !decided &&
    latestRound?.verdict !== null;

  return (
    <div className="space-y-6">
      {/* Input card */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="query">What do you want to buy?</Label>
            <Input
              id="query"
              placeholder="e.g. A new laptop for freelance work"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={streaming}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                disabled={streaming}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">
                Category{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as Category)}
                disabled={streaming}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
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

          <Button
            onClick={submitOriginal}
            disabled={streaming || !query.trim() || !amount}
            className="w-full"
          >
            {streaming && streamingTarget === "original" ? (
              <Loader className="size-4 animate-spin" />
            ) : (
              <Gavel className="size-4" />
            )}
            {streaming && streamingTarget === "original"
              ? "The Council is deliberating…"
              : "Consult the Council"}
          </Button>
        </CardContent>
      </Card>

      {/* Rounds */}
      {hasAnyResults && (
        <div className="space-y-6">
          {rounds.map((round, idx) => (
            <RoundSection
              key={idx}
              round={round}
              roundIndex={idx}
              isLatest={idx === latestRoundIdx}
              streaming={
                streaming &&
                streamingTarget !== null &&
                idx === rounds.length - 1
              }
              decided={idx === latestRoundIdx ? decided : null}
              deciding={deciding}
              canDecide={sessionId !== null && idx === latestRoundIdx}
              showAppealedBadge={idx < latestRoundIdx}
              onDecide={decide}
            />
          ))}

          {/* Appeal controls / form */}
          {canAppealAgain && latestRound?.verdict && (
            <Card>
              <CardContent className="p-5 space-y-3">
                {showAppealForm ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="appeal-text">
                        Your appeal (round {rounds.length})
                      </Label>
                      <Textarea
                        id="appeal-text"
                        placeholder="e.g. I won ₹100k in a hackathon — that should change the math."
                        rows={3}
                        value={appealText}
                        onChange={(e) => setAppealText(e.target.value)}
                        disabled={streaming}
                      />
                      <p className="text-xs text-muted-foreground">
                        New income gets folded into the math.{" "}
                        <span className="text-foreground/80">One-time</span>{" "}
                        amounts log as adjustments;{" "}
                        <span className="text-foreground/80">recurring</span>{" "}
                        ones bump monthly income just for this round.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={submitAppeal}
                        disabled={streaming || !appealText.trim()}
                      >
                        {streaming && streamingTarget === "appeal" ? (
                          <Loader className="size-3.5 animate-spin" />
                        ) : (
                          <MessageSquare className="size-3.5" />
                        )}
                        Send appeal
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowAppealForm(false);
                          setAppealText("");
                        }}
                        disabled={streaming}
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm text-muted-foreground">
                      Got more context the Council didn&apos;t have?{" "}
                      <span className="text-foreground/80">
                        Appeal up to {MAX_APPEAL_ROUNDS - (rounds.length - 1)}{" "}
                        more time{rounds.length === MAX_APPEAL_ROUNDS ? "" : "s"}.
                      </span>
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAppealForm(true)}
                    >
                      <MessageSquare className="size-3.5" />
                      Appeal
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function RoundSection({
  round,
  roundIndex,
  isLatest,
  streaming,
  decided,
  deciding,
  canDecide,
  showAppealedBadge,
  onDecide,
}: {
  round: RoundView;
  roundIndex: number;
  isLatest: boolean;
  streaming: boolean;
  decided: "accepted" | "declined" | null;
  deciding: boolean;
  canDecide: boolean;
  showAppealedBadge: boolean;
  onDecide: (action: "accept" | "decline") => void;
}) {
  const isAppeal = round.appealText !== null;

  return (
    <div className="space-y-4">
      {isAppeal && (
        <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Appeal round {roundIndex}</h2>
          </div>
          {showAppealedBadge && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Superseded
            </Badge>
          )}
        </div>
      )}

      {isAppeal && round.appealText && (
        <Card>
          <CardContent className="p-4 text-sm text-foreground/80 leading-relaxed">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Your argument
            </span>
            <p className="mt-1">{round.appealText}</p>
          </CardContent>
        </Card>
      )}

      {round.financeVerdict && (
        <MathCard financeVerdict={round.financeVerdict} />
      )}

      {round.transcript.length > 0 && (
        <div className="space-y-3">
          {round.transcript.map((turn, i) => (
            <AgentBubble
              key={i}
              turn={turn}
              isLive={streaming && i === round.transcript.length - 1}
            />
          ))}
        </div>
      )}

      {round.verdict && round.reasoning && round.financeVerdict && (
        <VerdictCard
          verdict={round.verdict}
          reasoning={round.reasoning}
          decided={isLatest ? decided : null}
          deciding={deciding}
          canDecide={canDecide}
          paymentMode={round.financeVerdict.paymentMode}
          showSupersededBadge={showAppealedBadge}
          onDecide={onDecide}
        />
      )}
    </div>
  );
}

function MathCard({
  financeVerdict,
}: {
  financeVerdict: FinanceVerdictView;
}) {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">The math</h2>
          </div>
          <Badge
            variant="outline"
            className={cn("capitalize", SAFETY_TONE[financeVerdict.safety])}
          >
            {financeVerdict.safety.replace("-", " ")}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {financeVerdict.mathVerdict}
        </p>
        <div className="grid grid-cols-3 gap-3 pt-2">
          <Stat label="Surplus" value={formatCurrency(financeVerdict.surplus)} />
          <Stat
            label="Est. EMI / mo"
            value={formatCurrency(financeVerdict.estimatedEmi)}
          />
          <Stat
            label="EMI as % of surplus"
            value={
              Number.isFinite(financeVerdict.emiImpactPercent)
                ? `${Math.round(financeVerdict.emiImpactPercent)}%`
                : "∞"
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function AgentBubble({ turn, isLive }: { turn: Turn; isLive: boolean }) {
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
        <p className="text-sm leading-relaxed text-foreground/90">
          {turn.content}
          {isLive && (
            <span
              className={cn(
                "inline-block w-1.5 h-3.5 ml-0.5 align-middle animate-pulse",
                isMiser ? "bg-slate-300" : "bg-amber-300",
              )}
            />
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function VerdictCard({
  verdict,
  reasoning,
  decided,
  deciding,
  canDecide,
  paymentMode,
  showSupersededBadge,
  onDecide,
}: {
  verdict: "approved" | "rejected";
  reasoning: string;
  decided: "accepted" | "declined" | null;
  deciding: boolean;
  canDecide: boolean;
  paymentMode: "cash" | "emi" | "deferred-loan";
  showSupersededBadge: boolean;
  onDecide: (action: "accept" | "decline") => void;
}) {
  const approved = verdict === "approved";
  const canAccept = approved && paymentMode !== "deferred-loan";

  return (
    <Card
      className={cn(
        approved
          ? "ring-emerald-500/30 bg-emerald-500/5"
          : "ring-red-500/30 bg-red-500/5",
      )}
    >
      <CardContent className="p-5 space-y-3">
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
        <p className="text-sm leading-relaxed">{reasoning}</p>

        {showSupersededBadge ? (
          <div className="flex items-center gap-2 pt-3 border-t border-border">
            <Badge variant="outline" className="text-xs">
              Superseded by appeal
            </Badge>
          </div>
        ) : decided ? (
          <div className="flex items-center gap-2 pt-3 border-t border-border">
            <Badge
              variant="outline"
              className={cn(
                "capitalize",
                decided === "accepted"
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                  : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
              )}
            >
              {decided === "accepted" ? "Accepted & logged" : "Declined"}
            </Badge>
            <p className="text-xs text-muted-foreground">
              {decided === "accepted"
                ? "Find it in your transactions."
                : "No transaction logged."}
            </p>
          </div>
        ) : canDecide ? (
          <div className="flex items-center gap-2 pt-3 border-t border-border">
            {canAccept && (
              <Button
                size="sm"
                onClick={() => onDecide("accept")}
                disabled={deciding}
              >
                {deciding ? (
                  <Loader className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Accept & log
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDecide("decline")}
              disabled={deciding}
            >
              <X className="size-3.5" />
              Decline
            </Button>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          This is a thinking aid, not financial advice.
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
