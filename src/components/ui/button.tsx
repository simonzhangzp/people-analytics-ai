"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-[6px] border px-4 text-[13px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157d5]/25 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-[#3157d5] text-white hover:bg-[#2848aa]",
        secondary:
          "border-[#d1d5db] bg-white text-[#24324b] hover:bg-[#f7f8fa]",
        ghost:
          "border-transparent bg-transparent text-[#526078] hover:bg-[#eef1f5] hover:text-[#1a2740]",
        danger:
          "border-[#efd4d4] bg-[#fdf7f7] text-[#934646] hover:bg-[#fbeeee]",
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

