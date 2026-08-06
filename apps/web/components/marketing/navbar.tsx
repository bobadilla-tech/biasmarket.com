"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { LanguageToggle } from "@/components/landing/language-toggle";

function NavLinks(
  { onNavigate, className }: { onNavigate?: () => void; className?: string },
) {
  const t = useTranslations("marketing.navbar");

  return (
    <nav className={className}>
      <Link
        href="/founder"
        onClick={onNavigate}
        className="hover:text-foreground"
      >
        {t("links.founder")}
      </Link>
      <Link
        href="/enterprise"
        onClick={onNavigate}
        className="hover:text-foreground"
      >
        {t("links.enterprise")}
      </Link>
      <Link
        href="/contact"
        onClick={onNavigate}
        className="hover:text-foreground"
      >
        {t("links.contact")}
      </Link>
    </nav>
  );
}

function AuthCta({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("marketing.navbar");
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <div className="h-9 w-24" />;

  if (session) {
    return (
      <Link
        href="/account"
        onClick={onNavigate}
        className={buttonVariants({ size: "sm", className: "h-9 px-4" })}
      >
        {t("myAccount")}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        onClick={onNavigate}
        className={buttonVariants({
          size: "sm",
          variant: "ghost",
          className: "h-9 px-3",
        })}
      >
        {t("logIn")}
      </Link>
      <Link
        href="/onboarding"
        onClick={onNavigate}
        className={buttonVariants({ size: "sm", className: "h-9 px-4" })}
      >
        {t("signUp")}
      </Link>
    </div>
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
      <SheetContent side="right" className="w-70 p-6">
        <div className="flex flex-col gap-6">
          <NavLinks
            onNavigate={close}
            className="flex flex-col gap-4 text-base text-muted-foreground"
          />
          <LanguageToggle />
          <AuthCta onNavigate={close} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Navbar() {
  const _t = useTranslations("marketing.navbar");

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex items-center">
          <Image
            src="/logos/horizontal.png"
            alt="Bias Market"
            width={164}
            height={81}
            className="h-8 w-auto"
          />
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <NavLinks className="flex items-center gap-6 text-sm text-muted-foreground" />
          <LanguageToggle />
          <AuthCta />
        </div>

        <div className="md:hidden">
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
