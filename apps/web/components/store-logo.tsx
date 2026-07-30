import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface StoreLogoProps {
  name: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Override the default theme-CSS-var gradient — for live previews of an unsaved palette. */
  gradient?: { from: string; to: string };
}

export function StoreLogo({ name, logoUrl, size = 48, className, style, gradient }: StoreLogoProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name || "Store logo"}
        className={cn("rounded-2xl object-cover shadow-sm", className)}
        style={{ width: size, height: size, ...style }}
      />
    );
  }

  return (
    <div
      className={cn("flex items-center justify-center rounded-2xl font-semibold text-white", className)}
      style={{
        width: size,
        height: size,
        background: gradient
          ? `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.to} 100%)`
          : "linear-gradient(135deg, var(--store-accent) 0%, var(--store-primary) 100%)",
        ...style,
      }}
    >
      {(name || "BM").slice(0, 2).toUpperCase()}
    </div>
  );
}
