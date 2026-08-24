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
    <footer className="bg-[#F7F7F7] px-6 pt-8 pb-10 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <h3 className="text-[20px] leading-[25px] font-extrabold tracking-wide text-[#181818] uppercase">
          Biasmarket
        </h3>
        <p className="mt-0.5 text-[13px] leading-[15px] text-[#7A7A7A]">
          {t("tagline")}
        </p>

        <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-10">
          {columns.map((column) => (
            <div key={column.heading}>
              <h4 className="text-sm leading-[17px] font-semibold text-[#181818]">
                {column.heading}
              </h4>
              <ul className="mt-2.5 space-y-2">
                {column.links.map((label) => (
                  <li key={label}>
                    <span className="cursor-default text-xs leading-[14px] font-normal text-[#7A7A7A]">
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="col-span-2 sm:col-span-1">
            <h4 className="text-sm leading-[17px] font-semibold text-black">
              {t("networks")}
            </h4>
            <div className="mt-2.5 flex items-center gap-2">
              {socials.map((social) => (
                <span
                  key={social.label}
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-[#F2F2F2]"
                >
                  <Image
                    src={social.image}
                    alt={social.label}
                    width={40}
                    height={40}
                    className="size-7 object-contain"
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
