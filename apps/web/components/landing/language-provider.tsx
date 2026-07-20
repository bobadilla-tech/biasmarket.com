"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { landingEn, landingEs } from "@biasmarket/i18n";

export type Locale = "es" | "en";

const dictionaries = { es: landingEs, en: landingEn } as const;

export type LandingCopy = (typeof dictionaries)["es"];

type LanguageContextValue = {
  locale: Locale;
  copy: LandingCopy;
  toggle: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "bm-landing-locale";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("es");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") setLocale(stored);
  }, []);

  function toggle() {
    setLocale((prev) => {
      const next: Locale = prev === "es" ? "en" : "es";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return (
    <LanguageContext.Provider
      value={{ locale, copy: dictionaries[locale], toggle }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
