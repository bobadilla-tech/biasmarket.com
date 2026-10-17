import { type Locale } from "@biasmarket/i18n";
import { getMobileMessages } from "@biasmarket/i18n/mobile";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const MobileI18nContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
} | null>(null);

function getSystemLocale(): Locale {
  return Intl.DateTimeFormat()
    .resolvedOptions()
    .locale.toLowerCase()
    .startsWith("es")
    ? "es"
    : "en";
}

export function MobileI18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>(getSystemLocale);
  const value = useMemo(() => ({ locale, setLocale }), [locale]);

  return (
    <MobileI18nContext.Provider value={value}>
      {children}
    </MobileI18nContext.Provider>
  );
}

export function useMobileI18n() {
  const context = useContext(MobileI18nContext);
  if (!context) {
    throw new Error("useMobileI18n must be used inside MobileI18nProvider");
  }

  const t = useCallback(
    (key: string, values?: Record<string, string | number>) => {
      const message = key
        .split(".")
        .reduce<unknown>(
          (current, part) =>
            current && typeof current === "object"
              ? (current as Record<string, unknown>)[part]
              : undefined,
          getMobileMessages(context.locale),
        );
      if (typeof message !== "string") return key;
      return message.replace(/\{(\w+)\}/g, (match, name: string) =>
        values?.[name] === undefined ? match : String(values[name]),
      );
    },
    [context.locale],
  );

  return { ...context, t };
}
