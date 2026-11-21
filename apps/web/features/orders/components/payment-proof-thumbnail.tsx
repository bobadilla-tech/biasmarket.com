"use client";

import { FileText } from "lucide-react";

export function PaymentProofThumbnail({
  url,
  isPdf,
  label,
  className,
  imageClassName,
  onPreview,
  showPdfLabel = false,
}: {
  url: string;
  isPdf: boolean;
  label: string;
  className: string;
  imageClassName: string;
  onPreview?: () => void;
  showPdfLabel?: boolean;
}) {
  if (isPdf) {
    return (
      <a href={url} aria-label={label} className={className}>
        <FileText aria-hidden="true" className="size-5" />
        <span className={showPdfLabel ? "text-xs font-semibold" : "sr-only"}>
          PDF
        </span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onPreview}
      aria-label={label}
      className={className}
    >
      <img src={url} alt="" className={imageClassName} />
    </button>
  );
}
