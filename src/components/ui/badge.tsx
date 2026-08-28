import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold leading-none",
  {
    variants: {
      variant: {
        neutral: "border-[#e3e6eb] bg-[#f1f3f6] text-[#697386]",
        info: "border-[#dae3fb] bg-[#edf2ff] text-[#3657af]",
        success: "border-[#d2e8dc] bg-[#eaf5ef] text-[#2f7659]",
        warning: "border-[#f1dfc4] bg-[#fbf2e5] text-[#8a571c]",
        danger: "border-[#efd4d4] bg-[#fbeeee] text-[#934646]",
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

