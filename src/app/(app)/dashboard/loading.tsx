import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-8 w-44" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 space-y-3">
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                <Skeleton className="h-1.5 w-full" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
