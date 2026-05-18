import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AddTransactionDialog } from "./add-transaction-dialog";
import { ImportCsvDialog } from "./import-csv-dialog";
import {
  TransactionsList,
  type ListTransaction,
} from "./transactions-list";

const RANGES = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "all", label: "All" },
] as const;

type Range = (typeof RANGES)[number]["value"];

function normalizeRange(input: string | undefined): Range {
  return (RANGES.find((r) => r.value === input)?.value ?? "30") as Range;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range = normalizeRange(sp.range);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  let query = supabase
    .from("transactions")
    .select("id, description, amount, category, source, occurred_at")
    .eq("user_id", user.id)
    .order("occurred_at", { ascending: false });

  if (range !== "all") {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - Number.parseInt(range, 10));
    query = query.gte("occurred_at", fromDate.toISOString());
  }

  const { data, error } = await query;

  const transactions: ListTransaction[] = (data ?? []).map((row) => ({
    id: row.id as string,
    description: row.description as string,
    amount: Number(row.amount),
    category: row.category as string,
    source: row.source as ListTransaction["source"],
    occurred_at: row.occurred_at as string,
  }));

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every inflow and outflow."
        action={
          <div className="flex items-center gap-2">
            <ImportCsvDialog />
            <AddTransactionDialog />
          </div>
        }
      />

      <div className="flex items-center gap-1 mb-4">
        {RANGES.map((r) => (
          <Link
            key={r.value}
            href={
              r.value === "30"
                ? "/transactions"
                : `/transactions?range=${r.value}`
            }
            className={cn(
              "inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors",
              range === r.value
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {transactions.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {error
              ? `Error loading transactions: ${error.message}`
              : 'No transactions in this range yet. Click "Add transaction" to log one.'}
          </CardContent>
        </Card>
      ) : (
        <TransactionsList transactions={transactions} />
      )}
    </>
  );
}
