import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold leading-none",
  {
    variants: {
      variant: {
        neutral: "border-edge bg-canvas-2 text-muted",
        info: "border-primary-ring bg-primary-soft text-primary-deep",
        success: "border-certified-line bg-certified-soft text-certified-dark",
        warning: "border-gold-line bg-gold-soft text-gold-dark",
        danger: "border-danger-line bg-danger-soft text-danger",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

