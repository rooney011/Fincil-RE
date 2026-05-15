import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>

      <div className="flex items-center gap-1 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-12" />
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="size-7 rounded-full" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
