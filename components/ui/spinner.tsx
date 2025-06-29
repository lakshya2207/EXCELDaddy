// components/ui/spinner.tsx
import { cn } from "@/lib/utils"; // ShadCN’s utility

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-transparent",
        className
      )}
    />
  );
}
