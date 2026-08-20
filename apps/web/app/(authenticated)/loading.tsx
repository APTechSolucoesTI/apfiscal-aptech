import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="space-y-5" aria-label="Carregando página"><Skeleton className="h-9 w-64" /><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;
}
