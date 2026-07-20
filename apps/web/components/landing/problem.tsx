"use client";

import { useLanguage } from "./language-provider";

export function Problem() {
  const { copy } = useLanguage();
  const { problem } = copy;

  return (
    <section className="border-t border-white/10 bg-black/20 px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {problem.title}
        </h2>
        <p className="mt-6 text-muted-foreground">{problem.intro}</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {problem.items.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-pink" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-8 font-medium text-brand-pink">{problem.escalation}</p>
        <ul className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
          {problem.painPoints.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-white/30" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-lg font-semibold">{problem.outro}</p>
      </div>
    </section>
  );
}
