import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <div className="space-y-2 mb-8">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Card>
        <CardContent className="p-6 space-y-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
