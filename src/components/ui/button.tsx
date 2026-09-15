"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border px-4 text-[13px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-primary text-white hover:bg-primary-dark",
        secondary:
          "border-edge bg-white text-ink hover:bg-canvas-2",
        ghost:
          "border-transparent bg-transparent text-body hover:bg-edge hover:text-ink",
        danger:
          "border-danger-line bg-danger-soft text-danger hover:bg-danger-soft",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 min-h-9 px-3 text-[12px]",
        lg: "h-11 min-h-11 px-5 text-[14px]",
        icon: "size-10 min-h-10 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };

