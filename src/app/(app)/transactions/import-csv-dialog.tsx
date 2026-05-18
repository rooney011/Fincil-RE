"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader, Upload, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn, formatCurrency } from "@/lib/utils";
import { parseCsv, type ParseResult } from "@/lib/csv/parse";
import { importTransactions } from "./actions";
import { CATEGORIES, type Category } from "./constants";

const PREVIEW_LIMIT = 20;

export function ImportCsvDialog() {
  const [open, setOpen] = useState(false);
  const [rawCsv, setRawCsv] = useState("");
  const [flipSigns, setFlipSigns] = useState(false);
  const [pending, startImport] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const result: ParseResult | null = useMemo(() => {
    if (!rawCsv.trim()) return null;
    return parseCsv(rawCsv);
  }, [rawCsv]);

  const adjustedRows = useMemo(() => {
    if (!result) return [];
    return result.rows.map((r) => ({
      ...r,
      amount: flipSigns ? -r.amount : r.amount,
    }));
  }, [result, flipSigns]);

  function reset() {
    setRawCsv("");
    setFlipSigns(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(file: File) {
    try {
      const text = await file.text();
      setRawCsv(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read file.");
    }
  }

  function submit() {
    if (adjustedRows.length === 0) return;
    startImport(async () => {
      const payload = adjustedRows.map((r) => ({
        description: r.description,
        amount: r.amount,
        category: r.category,
        occurred_at: r.occurred_at,
      }));
      const res = await importTransactions({ rows: payload });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Imported ${res.inserted} transactions. Embeddings running in the background.`,
      );
      reset();
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <Upload className="size-4" />
            Import CSV
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import transactions from CSV</DialogTitle>
          <DialogDescription>
            Paste or upload a CSV. Headers are auto-detected — supported columns
            include date, description, amount, and category. Preview before
            committing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="size-4" />
              Upload .csv
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <span className="text-xs text-muted-foreground">
              …or paste below.
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csv-input">CSV content</Label>
            <Textarea
              id="csv-input"
              rows={6}
              spellCheck={false}
              value={rawCsv}
              onChange={(e) => setRawCsv(e.target.value)}
              placeholder={"date,description,amount,category\n2026-05-14,Lunch,-220,food\n2026-05-14,Petrol,-1200,transport"}
              className="font-mono text-xs"
            />
          </div>

          {result && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {adjustedRows.length} valid row
                    {adjustedRows.length === 1 ? "" : "s"}
                    {result.errors.length > 0 && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-destructive">
                          {result.errors.length} skipped
                        </span>
                      </>
                    )}
                  </p>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={flipSigns}
                      onChange={(e) => setFlipSigns(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    Flip signs (treat positives as expenses)
                  </label>
                </div>

                {adjustedRows.length > 0 && (
                  <div className="border border-border rounded-md overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted text-muted-foreground sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">Date</th>
                            <th className="text-left px-3 py-2 font-medium">Description</th>
                            <th className="text-right px-3 py-2 font-medium">Amount</th>
                            <th className="text-left px-3 py-2 font-medium">Category</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adjustedRows.slice(0, PREVIEW_LIMIT).map((r, i) => (
                            <tr
                              key={i}
                              className="border-t border-border/50"
                            >
                              <td className="px-3 py-1.5 font-mono tabular-nums">
                                {r.occurred_at}
                              </td>
                              <td className="px-3 py-1.5 truncate max-w-[260px]">
                                {r.description}
                              </td>
                              <td
                                className={cn(
                                  "px-3 py-1.5 text-right font-mono tabular-nums",
                                  r.amount < 0
                                    ? "text-destructive"
                                    : "text-emerald-500",
                                )}
                              >
                                {r.amount < 0 ? "-" : "+"}
                                {formatCurrency(Math.abs(r.amount))}
                              </td>
                              <td className="px-3 py-1.5 capitalize text-muted-foreground">
                                {r.category}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {adjustedRows.length > PREVIEW_LIMIT && (
                      <div className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/40 border-t border-border">
                        Showing first {PREVIEW_LIMIT} of {adjustedRows.length} rows.
                      </div>
                    )}
                  </div>
                )}

                {result.errors.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Skipped rows ({result.errors.length})
                    </summary>
                    <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {result.errors.slice(0, 30).map((e, i) => (
                        <li
                          key={i}
                          className="font-mono text-[11px] text-destructive"
                        >
                          line {e.lineNumber}: {e.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <CategoryHint categories={CATEGORIES} />
              </CardContent>
            </Card>
          )}
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
            disabled={pending || adjustedRows.length === 0}
          >
            {pending && <Loader className="size-4 animate-spin" />}
            Import {adjustedRows.length || ""} row
            {adjustedRows.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryHint({ categories }: { categories: readonly Category[] }) {
  return (
    <p className="text-[11px] text-muted-foreground">
      Categories normalized to:{" "}
      <span className="font-mono">{categories.join(", ")}</span>. Unknown values
      are guessed from the description.
    </p>
  );
}
