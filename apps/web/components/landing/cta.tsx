"use client";

import { Button } from "@/components/ui/button";
import { useLanguage } from "./language-provider";

export function Cta() {
  const { copy } = useLanguage();
  const { cta } = copy;

  return (
    <section className="border-t border-white/10 bg-gradient-to-br from-brand-violet/40 via-brand-ink to-brand-pink/20 px-6 py-20 text-center sm:px-10">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {cta.title}
        </h2>
        <p className="mt-4 text-muted-foreground">{cta.content}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" className="h-11 px-6">
            {cta.ctaPrimary}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 border-white/15 bg-white/5 px-6 text-foreground hover:bg-white/10"
          >
            {cta.ctaSecondary}
          </Button>
        </div>
      </div>
    </section>
  );
}
