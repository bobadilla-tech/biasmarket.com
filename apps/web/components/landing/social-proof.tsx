"use client";

import { Badge } from "@/components/ui/badge";
import { useLanguage } from "./language-provider";

export function SocialProof() {
  const { copy } = useLanguage();
  const { socialProof } = copy;

  return (
    <section className="px-6 py-16 sm:px-10">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {socialProof.title}
        </h2>
        <p className="mt-3 text-muted-foreground">{socialProof.intro}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {socialProof.items.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="bg-brand-violet/30 px-3 py-1 text-sm text-white"
            >
              {item}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}
