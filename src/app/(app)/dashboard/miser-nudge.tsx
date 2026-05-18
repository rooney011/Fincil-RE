import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Nudge } from "@/lib/insights/nudge";

const KIND_LABEL: Record<Nudge["kind"], string> = {
  low_surplus: "Low surplus",
  category_spike: "Category spike",
};

export function MiserNudge({ nudge }: { nudge: Nudge }) {
  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardContent className="p-4 sm:p-5 flex items-start gap-3">
        <div className="rounded-md bg-amber-500/10 p-2 shrink-0">
          <ShieldCheck className="size-4 text-amber-300" />
        </div>
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs uppercase tracking-wider text-amber-300">
              The Miser
            </p>
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wider"
            >
              {KIND_LABEL[nudge.kind]}
            </Badge>
          </div>
          <p className="text-sm leading-relaxed">{nudge.message}</p>
        </div>
      </CardContent>
    </Card>
  );
}
