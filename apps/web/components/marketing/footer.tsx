"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

interface FooterColumn {
  heading: string;
  links: string[];
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
    <footer className="bg-landing-footer px-4 py-10 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-5">
          {columns.map((column) => (
            <div key={column.heading}>
              <h3 className="text-lg font-medium text-black">
                {column.heading}
              </h3>
              <ul className="mt-4 space-y-3">
                {column.links.map((label) => (
                  <li key={label}>
                    <span className="cursor-default text-base font-light text-black/90">
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className="text-lg font-medium text-black">{t("networks")}</h3>
            <div className="mt-4 flex items-center gap-3 sm:gap-4">
              {socials.map((social) => (
                <span
                  key={social.label}
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-white sm:size-12"
                >
                  <Image
                    src={social.image}
                    alt={social.label}
                    width={40}
                    height={40}
                    className="h-7 w-7 object-contain sm:h-9 sm:w-9"
                  />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
