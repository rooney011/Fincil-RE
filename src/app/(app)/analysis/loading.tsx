import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <div className="space-y-2 mb-8">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex items-center gap-1 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-12" />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    </>
  );
}
