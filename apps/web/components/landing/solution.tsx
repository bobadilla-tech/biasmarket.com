"use client";

import { Check } from "lucide-react";
import { useLanguage } from "./language-provider";

export function Solution() {
  const { copy } = useLanguage();
  const { solution } = copy;

  return (
    <section className="px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {solution.title}
        </h2>
        <p className="mt-6 text-muted-foreground">{solution.intro}</p>
        <ul className="mt-4 grid gap-3">
          {solution.items.map((item) => (
            <li key={item} className="flex items-start gap-3">
              <Check className="mt-0.5 size-5 shrink-0 text-brand-gold" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-lg font-semibold">{solution.outro}</p>
      </div>
    </section>
  );
}
