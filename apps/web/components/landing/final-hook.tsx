"use client";

import { Button } from "@/components/ui/button";
import { useLanguage } from "./language-provider";

export function FinalHook() {
  const { copy } = useLanguage();
  const { finalHook } = copy;

  return (
    <footer className="border-t border-white/10 px-6 py-16 text-center sm:px-10">
      <div className="mx-auto max-w-xl">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {finalHook.title}
        </h2>
        <p className="mt-2 text-muted-foreground">{finalHook.content}</p>
        <Button size="lg" className="mt-6 h-11 px-6">
          {finalHook.cta}
        </Button>
      </div>
    </footer>
  );
}
