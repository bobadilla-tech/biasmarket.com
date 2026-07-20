"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useLanguage } from "./language-provider";

export function Features() {
  const { copy } = useLanguage();
  const { features } = copy;

  return (
    <section className="border-t border-white/10 bg-black/20 px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {features.title}
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {features.items.map((feature) => (
            <Card key={feature.title} className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-base">{feature.title}</CardTitle>
                <CardDescription className="text-muted-foreground">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
