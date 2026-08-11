"use client";

import { useState } from "react";
import Image from "next/image";
import { LogOut, Menu, Search, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { LanguageToggle } from "@/features/landing";
import { useMyStores } from "@/features/stores";
import { StoreLogo } from "@/components/store-logo";

function NavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const t = useTranslations("marketing.navbar");
  const items = [
    { key: "about", href: "/founder" },
    { key: "help", href: "/contact" },
    { key: "stores", href: "/stores" },
    { key: "new", href: "/search" },
  ] as const;

  return (
    <nav className={className}>
      {items.map(({ key, href }) =>
        key === "help" ? (
          <span
            key={key}
            aria-disabled="true"
            className="cursor-not-allowed opacity-50"
          >
            {t(`links.${key}`)}
          </span>
        ) : (
          <Link
            key={key}
            href={href}
            onClick={onNavigate}
            className="transition-colors hover:text-primary"
          >
            {t(`links.${key}`)}
          </Link>
        ),
      )}
    </nav>
  );
}

function SearchForm({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("marketing.navbar");
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const query = q.trim();
        if (query) {
          router.push(`/search?q=${encodeURIComponent(query)}`);
          onNavigate?.();
        }
      }}
      className="relative"
      role="search"
    >
      <input
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("search")}
        className="h-11 w-full rounded-full border border-black/20 bg-white pr-4 pl-10 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary"
      />
      <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-foreground" />
    </form>
  );
}

function AccountMenu({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("marketing.navbar");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: session, isPending } = authClient.useSession();
  const { data: stores, isPending: storesPending } = useMyStores({
    enabled: !!session,
  });

  const closeAndNavigate = () => {
    setOpen(false);
    onNavigate?.();
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    closeAndNavigate();
    router.push("/");
  };

  if (isPending) return <div className="size-9 rounded-full" />;

  const itemClassName =
    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t("account")}
            className="flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <User className="size-6" />
          </button>
        }
      />
      <PopoverContent align="end" className="w-64 p-2">
        {session ? (
          <div className="flex flex-col">
            <div className="px-2 pt-1 pb-2">
              <p className="truncate text-sm font-semibold">
                {session.user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {session.user.email}
              </p>
            </div>
            <Separator />
            <div className="pt-1">
              <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                {t("myStores")}
              </p>
              {storesPending ? (
                <div className="animate-pulse space-y-1 px-2">
                  <div className="h-8 rounded-lg bg-muted" />
                  <div className="h-8 rounded-lg bg-muted" />
                </div>
              ) : stores && stores.length > 0 ? (
                <div className="flex flex-col">
                  {stores.map((store) => (
                    <Link
                      key={store.id}
                      href={`/dashboard/${store.slug}`}
                      onClick={closeAndNavigate}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
                    >
                      <StoreLogo
                        name={store.name}
                        logoUrl={store.logoUrl}
                        size={28}
                        className="text-xs font-semibold"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">
                          {store.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          /{store.slug}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <Link
                  href="/onboarding/create-store"
                  onClick={closeAndNavigate}
                  className={itemClassName}
                >
                  {t("createStore")}
                </Link>
              )}
            </div>
            <Separator className="my-1" />
            <div className="flex flex-col">
              <Link
                href="/account"
                onClick={closeAndNavigate}
                className={itemClassName}
              >
                <User className="size-4" />
                {t("myAccount")}
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className={`${itemClassName} text-red-600 hover:bg-red-50`}
              >
                <LogOut className="size-4" />
                {t("signOut")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <Link
              href="/login"
              onClick={closeAndNavigate}
              className={itemClassName}
            >
              {t("logIn")}
            </Link>
            <Link
              href="/onboarding"
              onClick={closeAndNavigate}
              className={itemClassName}
            >
              {t("signUp")}
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MobileMenu() {
  const t = useTranslations("marketing.navbar");
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            aria-label={t("openMenu")}
            className="rounded-xl p-2 hover:bg-muted"
          >
            <Menu className="size-6" />
          </button>
        }
      />
      <SheetContent side="right" className="w-80 p-6">
        <div className="flex flex-col gap-6">
          <NavLinks
            onNavigate={close}
            className="flex flex-col gap-4 text-base text-muted-foreground"
          />
          <SearchForm onNavigate={close} />
          <div className="flex items-center gap-6">
            <AccountMenu onNavigate={close} />
            <LanguageToggle />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6 sm:px-10 lg:h-20">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src="/logos/horizontal.png"
            alt="Bias Market"
            width={164}
            height={81}
            className="h-8 w-auto"
          />
        </Link>

        <NavLinks className="hidden items-center gap-8 text-sm font-medium text-foreground lg:flex" />

        <div className="hidden max-w-xs flex-1 lg:block">
          <SearchForm />
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <AccountMenu />
          <LanguageToggle />
        </div>

        <div className="lg:hidden">
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
