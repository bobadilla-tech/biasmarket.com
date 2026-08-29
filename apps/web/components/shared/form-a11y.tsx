"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Field } from "@/components/ui/field";

export interface FormControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export function FormField({
  id,
  label,
  error,
  description,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  description?: ReactNode;
  children: (props: FormControlProps) => ReactNode;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <Field.Root invalid={Boolean(error)}>
      <Field.Label htmlFor={id}>{label}</Field.Label>
      {children({
        id,
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true as const } : {}),
      })}
      {description ? (
        <Field.Description id={descriptionId}>{description}</Field.Description>
      ) : null}
      <Field.Error id={errorId} match={Boolean(error)}>
        {error}
      </Field.Error>
    </Field.Root>
  );
}

export function FormErrorSummary({
  id = "form-error-summary",
  title,
  messages,
}: {
  id?: string;
  title: string;
  messages: string[];
}) {
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0) summaryRef.current?.focus();
  }, [messages.length, messages.join("\u0000")]);

  if (messages.length === 0) return null;

  return (
    <div
      ref={summaryRef}
      id={id}
      role="alert"
      tabIndex={-1}
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-error-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc pl-5">
        {messages.map((message, index) => (
          <li key={`${message}-${index}`}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

export function formErrorMessage(
  error: { message?: string } | undefined,
  fallback: string,
) {
  return error ? fallback : undefined;
}
