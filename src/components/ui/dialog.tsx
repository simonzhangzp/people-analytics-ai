"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: "center" | "left" | "right";
  }
>(({ className, children, side = "center", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#101828]/35 data-[state=closed]:animate-out data-[state=open]:animate-in" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 border border-[#dfe3e9] bg-white shadow-[0_4px_16px_rgba(15,23,42,0.08)] outline-none",
        side === "center" &&
          "left-1/2 top-1/2 max-h-[90vh] w-[calc(100%-2rem)] max-w-[760px] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[10px] p-6",
        side === "right" &&
          "inset-y-0 right-0 h-full w-full max-w-[400px] overflow-auto border-y-0 border-r-0",
        side === "left" &&
          "inset-y-0 left-0 h-full w-full max-w-[300px] overflow-auto border-y-0 border-l-0",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        aria-label="Close"
        className="absolute right-4 top-4 grid size-9 place-items-center rounded-[6px] text-[#667085] hover:bg-[#f1f3f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3157d5]/25"
      >
        <X aria-hidden="true" className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("space-y-2", className)} {...props} />
);

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-[20px] font-semibold tracking-[-0.02em] text-[#17243f]", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-[13px] leading-5 text-[#5d697c]", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

