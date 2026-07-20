"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "./language-toggle";
import { useLanguage } from "./language-provider";
import { PhotocardStack } from "./photocard-stack";

export function Hero() {
  const { copy } = useLanguage();
  const { hero } = copy;

  return (
    <header className="relative overflow-hidden px-6 pt-8 pb-20 sm:px-10">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_oklch(0.3_0.1_320)_0%,_transparent_60%)]" />
      <nav className="mx-auto flex max-w-5xl items-center justify-between">
        <span className="font-heading text-lg font-semibold tracking-tight">
          Bias Market
        </span>
        <LanguageToggle />
      </nav>

      <div className="mx-auto mt-16 grid max-w-5xl gap-12 sm:grid-cols-2 sm:items-center">
        <div className="flex flex-col items-start gap-6 text-left">
          <Badge variant="secondary" className="bg-brand-violet/30 text-white">
            {hero.badge}
          </Badge>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-balance sm:text-5xl">
            {hero.headline}
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            {hero.subheadline}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="h-11 px-6">
              {hero.ctaPrimary}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 border-white/15 bg-white/5 px-6 text-foreground hover:bg-white/10"
            >
              {hero.ctaSecondary}
            </Button>
          </div>
        </div>
        <PhotocardStack />
      </div>
    </header>
  );
}
