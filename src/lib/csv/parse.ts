// CSV → transactions parser.
//
// Auto-detects column order from common header names. If no headers are
// recognizable, falls back to positional order: date, description, amount,
// category. Returns rows + a list of per-row warnings so the UI can show a
// preview before committing.

import { CATEGORIES, type Category } from "@/app/(app)/transactions/constants";

export type ParsedRow = {
  ok: true;
  description: string;
  amount: number; // sign preserved from CSV; UI can flip all at once
  category: Category;
  occurred_at: string; // YYYY-MM-DD
  raw: string;
};

export type ParseError = {
  ok: false;
  reason: string;
  raw: string;
  lineNumber: number;
};

export type ParseResult = {
  rows: ParsedRow[];
  errors: ParseError[];
  detectedColumns: {
    date: number;
    description: number;
    amount: number;
    category: number | null;
  };
};

const DATE_KEYS = ["date", "occurred_at", "posted", "txn date", "transaction date"];
const DESC_KEYS = ["description", "desc", "narration", "note", "details", "particulars", "merchant"];
const AMOUNT_KEYS = ["amount", "value", "sum", "debit", "credit", "withdrawal", "deposit"];
const CATEGORY_KEYS = ["category", "type", "tag"];

const CATEGORY_SET = new Set<string>(CATEGORIES);

export function parseCsv(input: string): ParseResult {
  const lines = splitLines(input.trim());
  if (lines.length === 0) {
    return {
      rows: [],
      errors: [],
      detectedColumns: { date: 0, description: 1, amount: 2, category: 3 },
    };
  }

  const firstFields = splitRow(lines[0]).map((s) => s.toLowerCase().trim());
  const hasHeader = firstFields.some(
    (f) =>
      DATE_KEYS.includes(f) ||
      DESC_KEYS.includes(f) ||
      AMOUNT_KEYS.includes(f) ||
      CATEGORY_KEYS.includes(f),
  );

  let detectedColumns: ParseResult["detectedColumns"];
  let dataStart: number;

  if (hasHeader) {
    detectedColumns = {
      date: indexOfMatch(firstFields, DATE_KEYS) ?? 0,
      description: indexOfMatch(firstFields, DESC_KEYS) ?? 1,
      amount: indexOfMatch(firstFields, AMOUNT_KEYS) ?? 2,
      category: indexOfMatch(firstFields, CATEGORY_KEYS),
    };
    dataStart = 1;
  } else {
    detectedColumns = { date: 0, description: 1, amount: 2, category: 3 };
    dataStart = 0;
  }

  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  for (let i = dataStart; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const fields = splitRow(raw);

    const dateRaw = fields[detectedColumns.date]?.trim();
    const descRaw = fields[detectedColumns.description]?.trim();
    const amountRaw = fields[detectedColumns.amount]?.trim();
    const categoryRaw =
      detectedColumns.category !== null
        ? fields[detectedColumns.category]?.trim().toLowerCase()
        : null;

    if (!dateRaw || !descRaw || !amountRaw) {
      errors.push({
        ok: false,
        reason: "Missing date, description, or amount",
        raw,
        lineNumber: i + 1,
      });
      continue;
    }

    const isoDate = normalizeDate(dateRaw);
    if (!isoDate) {
      errors.push({
        ok: false,
        reason: `Couldn't read date "${dateRaw}"`,
        raw,
        lineNumber: i + 1,
      });
      continue;
    }

    const amount = parseAmount(amountRaw);
    if (!Number.isFinite(amount) || amount === 0) {
      errors.push({
        ok: false,
        reason: `Couldn't read amount "${amountRaw}"`,
        raw,
        lineNumber: i + 1,
      });
      continue;
    }

    const category =
      categoryRaw && CATEGORY_SET.has(categoryRaw)
        ? (categoryRaw as Category)
        : guessCategory(descRaw);

    rows.push({
      ok: true,
      description: descRaw,
      amount,
      category,
      occurred_at: isoDate,
      raw,
    });
  }

  return { rows, errors, detectedColumns };
}

function indexOfMatch(fields: string[], keys: string[]): number | null {
  for (let i = 0; i < fields.length; i += 1) {
    if (keys.includes(fields[i])) return i;
  }
  return null;
}

function splitLines(input: string): string[] {
  // Handles \r\n and \n; CSV with embedded newlines in quoted fields is out of
  // scope — bank exports rarely do that.
  return input.split(/\r?\n/);
}

function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normalizeDate(raw: string): string | null {
  // YYYY-MM-DD
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;

  // DD/MM/YYYY or DD-MM-YYYY (India default)
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(raw);
  if (dmy) {
    const y = dmy[3];
    const m = pad(dmy[2]);
    const d = pad(dmy[1]);
    if (Number(m) > 12) return null;
    return `${y}-${m}-${d}`;
  }

  // YYYY/MM/DD
  const ymd2 = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(raw);
  if (ymd2) return `${ymd2[1]}-${pad(ymd2[2])}-${pad(ymd2[3])}`;

  // Native Date fallback (covers things like "Mar 14, 2026")
  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = pad(String(parsed.getMonth() + 1));
    const d = pad(String(parsed.getDate()));
    return `${y}-${m}-${d}`;
  }

  return null;
}

function pad(s: string): string {
  return s.length === 1 ? `0${s}` : s;
}

function parseAmount(raw: string): number {
  // Strip currency symbols, thousands separators, surrounding whitespace.
  const cleaned = raw
    .replace(/[₹$€£,\s]/g, "")
    .replace(/^\(([^)]+)\)$/, "-$1"); // (1234) → -1234, accounting notation
  return Number.parseFloat(cleaned);
}

function guessCategory(description: string): Category {
  const d = description.toLowerCase();
  if (/salary|payroll|stipend/.test(d)) return "salary";
  if (/refund|reversal|cashback/.test(d)) return "refund";
  if (/gift/.test(d)) return "gift";
  if (/uber|ola|metro|petrol|fuel|cab/.test(d)) return "transport";
  if (/swiggy|zomato|biryani|cafe|restaurant|food|coffee/.test(d)) return "food";
  if (/electricity|bill|water|internet|airtel|jio|broadband/.test(d)) return "bills";
  if (/netflix|spotify|prime|youtube|subscription/.test(d)) return "subscription";
  if (/amazon|flipkart|myntra|shopping|store/.test(d)) return "shopping";
  if (/movie|concert|bar|club|game/.test(d)) return "entertainment";
  if (/pharma|hospital|clinic|doctor|medic/.test(d)) return "health";
  if (/college|course|fees|tuition|book/.test(d)) return "education";
  if (/flight|hotel|airbnb|trip|travel/.test(d)) return "travel";
  return "other";
}
