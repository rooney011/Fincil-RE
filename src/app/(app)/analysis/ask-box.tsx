"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Loader, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AskBox() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function ask() {
    if (question.trim().length === 0) {
      toast.error("Type a question first.");
      return;
    }

    setAnswer("");
    setStreaming(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/analysis/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? `Ask failed (${res.status})`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          setAnswer((prev) => prev + decoder.decode(value, { stream: true }));
        }
        if (done) break;
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        toast.error(
          e instanceof Error ? e.message : "Network error reaching the answer.",
        );
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Ask anything</h3>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ask-q">Your question</Label>
          <div className="flex gap-2">
            <Input
              id="ask-q"
              placeholder='e.g. "How much did I spend on food last month?"'
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !streaming) ask();
              }}
              disabled={streaming}
              className="flex-1"
            />
            <Button onClick={ask} disabled={streaming || !question.trim()}>
              {streaming ? (
                <Loader className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Ask
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Grounded on your profile + recent transactions. Not financial advice.
          </p>
        </div>

        {(answer || streaming) && (
          <div className="pt-3 border-t border-border">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {answer}
              {streaming && (
                <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-primary animate-pulse" />
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
