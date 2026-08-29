"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";

export function StorefrontThemeVars({ style }: { style: CSSProperties }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = new Map<string, string>();

    Object.entries(style).forEach(([key, value]) => {
      if (!key.startsWith("--")) return;
      previous.set(key, root.style.getPropertyValue(key));
      root.style.setProperty(key, String(value));
    });

    return () => {
      previous.forEach((value, key) => {
        if (value) root.style.setProperty(key, value);
        else root.style.removeProperty(key);
      });
    };
  }, [style]);

  return null;
}
