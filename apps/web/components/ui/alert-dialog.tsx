"use client";

import type * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";

import { cn } from "@/lib/utils";

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

function AlertDialogOverlay(
  { className, ...props }: AlertDialogPrimitive.Backdrop.Props,
) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent(
  { className, children, ...props }: AlertDialogPrimitive.Popup.Props,
) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[24px] border border-[#eadcf7] bg-white p-6 shadow-lg transition duration-150 ease-in-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader(
  { className, ...props }: React.ComponentProps<"div">,
) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function AlertDialogFooter(
  { className, ...props }: React.ComponentProps<"div">,
) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle(
  { className, ...props }: AlertDialogPrimitive.Title.Props,
) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-base font-semibold text-[#2d1649]", className)}
      {...props}
    />
  );
}

function AlertDialogDescription(
  { className, ...props }: AlertDialogPrimitive.Description.Props,
) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm text-[#8f7da8]", className)}
      {...props}
    />
  );
}

function AlertDialogClose({ ...props }: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />
  );
}

export {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
};
