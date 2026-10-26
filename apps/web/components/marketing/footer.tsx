"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

interface Social {
  label: string;
  image: string;
}

export function Footer() {
  const t = useTranslations("landing.footer");
  const columns = t.raw("columns") as FooterColumn[];
  const socials = t.raw("socials") as Social[];

  return (
    <footer className="bg-[#F7F7F7] px-6 pt-8 pb-10 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-[1344px]">
        <h3 className="text-[32px] leading-[39px] font-extrabold tracking-wide text-[#181818] sm:text-[48px] sm:leading-[56px] sm:font-bold sm:tracking-[-0.04em] sm:uppercase">
          Biasmarket
        </h3>
        <p className="mt-0.5 text-lg leading-[22px] text-[#5F5F5F] sm:mt-3 sm:text-[26px] sm:leading-[32px] sm:text-[#7A7A7A]">
          {t("tagline")}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-[20px] text-[#5F5F5F] sm:text-lg sm:leading-[26px]">
          {t("description")}
        </p>

        <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-8 sm:mt-9 sm:grid-cols-3 lg:grid-cols-5 lg:gap-10">
          {columns.map((column) => (
            <div key={column.heading}>
              <h4 className="text-xl leading-6 font-semibold text-[#181818] sm:text-[32px] sm:leading-[39px]">
                {column.heading}
              </h4>
              <ul className="mt-2.5 space-y-1 sm:mt-5 sm:space-y-4">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm leading-[18px] font-normal text-[#5F5F5F] hover:text-[#181818] hover:underline sm:text-[24px] sm:leading-[30px] sm:text-[#7A7A7A]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="col-span-2 sm:col-span-1">
            <h4 className="text-xl leading-6 font-semibold text-black sm:text-[32px] sm:leading-[39px]">
              {t("networks")}
            </h4>
            <div className="mt-2.5 flex items-center gap-2 sm:mt-4">
              {socials.map((social) => (
                <span
                  key={social.label}
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-[#F2F2F2] sm:size-[63px]"
                >
                  <Image
                    src={social.image}
                    alt={social.label}
                    width={40}
                    height={40}
                    className="size-7 object-contain sm:size-[55px]"
                  />
                </span>
              ))}
            </div>
          </div>
        </div>

        <nav
          aria-label={t("legalNav")}
          className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-black/10 pt-6 text-sm text-[#5F5F5F] sm:text-lg"
        >
          <Link
            href="/privacy"
            className="hover:text-[#181818] hover:underline"
          >
            {t("privacy")}
          </Link>
          <Link href="/terms" className="hover:text-[#181818] hover:underline">
            {t("terms")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
