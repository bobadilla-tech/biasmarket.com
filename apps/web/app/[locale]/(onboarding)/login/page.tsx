import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { LoginForm } from "@/features/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding.login" });
  return { title: t("title") };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding.login" });

  return (
    <div className="login-editorial min-h-dvh overflow-hidden text-[#211b37]">
      <header className="relative z-10 mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12 lg:py-7">
        <Link href="/" className="group flex flex-col">
          <span className="font-serif text-[1.7rem] font-semibold leading-none tracking-[-0.06em] text-[#171323] sm:text-3xl">
            BiasMarket
          </span>
          <span className="mt-1.5 text-[9px] font-medium tracking-[0.22em] text-[#625a7d] sm:text-[10px]">
            {t("marketplaceTagline")}
          </span>
        </Link>
        <nav
          aria-label={t("navigationLabel")}
          className="hidden items-center gap-8 text-sm font-medium text-[#332b4a] md:flex"
        >
          <Link
            className="transition hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            href="/search"
          >
            {t("navShop")}
          </Link>
          <Link
            className="transition hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            href="/search?q=photocard"
          >
            {t("navPhotocards")}
          </Link>
          <Link
            className="transition hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            href="/search?q=merch"
          >
            {t("navMerch")}
          </Link>
          <Link
            className="transition hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            href="/contact"
          >
            {t("navContact")}
          </Link>
        </nav>
        <div className="hidden items-center gap-3 text-right text-[10px] font-semibold leading-[1.55] tracking-[0.2em] text-[#40385d] lg:flex">
          <span
            aria-hidden="true"
            className="text-3xl leading-none text-[#8a61eb]"
          >
            ✦
          </span>
          <span>
            {t("mottoCollect")}
            <br />
            {t("mottoConnect")}
            <br />
            {t("mottoBelong")}
          </span>
        </div>
      </header>

      <main className="relative mx-auto grid min-h-[calc(100dvh-88px)] max-w-[1440px] grid-cols-1 items-center gap-8 px-5 pb-10 pt-3 sm:px-8 lg:min-h-[calc(100dvh-110px)] lg:grid-cols-[minmax(0,1fr)_minmax(390px,460px)] lg:gap-10 lg:px-12 lg:pb-24 lg:pt-3">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="login-glow absolute -left-36 top-24 h-[32rem] w-[32rem] rounded-full" />
          <div className="login-glow login-glow-right absolute -right-36 top-24 h-[34rem] w-[34rem] rounded-full" />
          <span className="absolute left-[46%] top-[10%] text-4xl text-violet-500/80">
            ✦
          </span>
          <span className="absolute left-[6%] top-[58%] text-2xl text-[#a886ee]">
            ✧
          </span>
          <span className="absolute right-[4%] top-[65%] text-3xl text-[#d98acb]">
            ✧
          </span>
        </div>

        <section className="relative z-[1] order-2 flex min-h-[330px] flex-col justify-center lg:order-1 lg:min-h-[560px]">
          <div className="max-w-[650px]">
            <p className="mb-4 text-[10px] font-semibold tracking-[0.28em] text-[#71658f] sm:text-xs">
              {t("heroEyebrow")}
            </p>
            <h1 className="max-w-[620px] font-serif text-[clamp(3.3rem,8vw,6.8rem)] leading-[0.91] tracking-[-0.055em] text-[#171323]">
              {t("heroTitleFirst")}
              <br />
              {t("heroTitleSecond")}
              <span className="ml-2 inline-block align-[0.1em] text-[0.55em] text-[#8e61e8]">
                ✦
              </span>
            </h1>
            <p className="mt-5 max-w-[490px] text-base leading-relaxed text-[#423a5c] sm:text-lg">
              {t("heroDescription")}
            </p>
            <div className="mt-7 hidden items-start gap-5 border-l border-[#9885c5] pl-4 text-[11px] font-medium leading-[1.85] tracking-[0.2em] text-[#51466e] sm:flex">
              <span>
                {t("categoryPhotocards")}
                <br />
                {t("categoryAlbums")}
                <br />
                {t("categoryApparel")}
              </span>
              <span className="text-[#9c8cb8]">✧</span>
              <span>
                {t("categoryCollectibles")}
                <br />
                {t("categoryAndMore")}
              </span>
            </div>
          </div>

          <div className="relative mt-7 hidden h-[225px] max-w-[650px] sm:block lg:mt-2 lg:h-[270px]">
            <div className="login-photocard login-photocard-one absolute bottom-5 left-[4%] h-[190px] w-[142px] -rotate-[13deg] rounded-[20px] border border-white/90 bg-white/40 p-2 shadow-[0_22px_55px_rgba(70,45,130,0.20)] backdrop-blur-sm lg:left-[7%] lg:h-[224px] lg:w-[168px]">
              <div className="relative h-full overflow-hidden rounded-[14px] border border-white/80 bg-gradient-to-br from-[#bed1f5] via-[#e7b9e5] to-[#f8e2cf]">
                <Image
                  src="/landing/photocard.png"
                  alt={t("photocardImageAlt")}
                  fill
                  sizes="168px"
                  className="object-cover opacity-90 mix-blend-multiply"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-[#8e7ce7]/25 via-transparent to-white/55" />
                <span className="absolute bottom-3 left-3 rounded-full border border-white/80 bg-white/50 px-2 py-1 text-[8px] tracking-[0.18em] text-[#44375f] backdrop-blur">
                  {t("collectMoments")}
                </span>
              </div>
            </div>
            <div className="login-photocard login-photocard-two absolute bottom-3 left-[32%] h-[202px] w-[150px] rotate-[8deg] rounded-[20px] border border-white/90 bg-white/45 p-2 shadow-[0_25px_60px_rgba(70,45,130,0.20)] backdrop-blur-sm lg:left-[34%] lg:h-[242px] lg:w-[180px]">
              <div className="relative h-full overflow-hidden rounded-[14px] bg-gradient-to-br from-[#f8d7e7] via-[#c8c7f6] to-[#a8dce2]">
                <Image
                  src="/landing/album.png"
                  alt={t("albumImageAlt")}
                  fill
                  sizes="180px"
                  className="object-cover opacity-80 mix-blend-multiply"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-[#a081ee]/25 via-transparent to-white/45" />
                <span className="absolute right-3 top-2 text-xl text-white drop-shadow">
                  ✧
                </span>
              </div>
            </div>
            <div className="login-photocard login-photocard-three absolute bottom-10 left-[62%] hidden h-[152px] w-[114px] -rotate-[8deg] rounded-[17px] border border-white/90 bg-white/45 p-1.5 shadow-[0_20px_45px_rgba(70,45,130,0.16)] backdrop-blur-sm lg:block">
              <div className="relative h-full overflow-hidden rounded-[12px] bg-gradient-to-br from-[#d8c7fa] via-[#f5d4df] to-[#b9e2eb]">
                <Image
                  src="/landing/sticker.png"
                  alt={t("starImageAlt")}
                  fill
                  sizes="114px"
                  className="object-cover opacity-75 mix-blend-multiply"
                />
              </div>
            </div>
            <span
              aria-hidden="true"
              className="absolute left-[23%] top-1 text-3xl text-[#e8a8db]"
            >
              ✦
            </span>
            <span
              aria-hidden="true"
              className="absolute right-[12%] bottom-5 text-2xl text-[#8b71e9]"
            >
              ✧
            </span>
          </div>
        </section>

        <section
          aria-label={t("signInRegionLabel")}
          className="relative z-[1] order-1 mx-auto w-full max-w-[460px] lg:order-2"
        >
          <LoginForm />
        </section>

        <div className="relative z-[1] order-3 hidden grid-cols-4 items-center border-t border-[#796aa3]/30 pt-5 text-[#322a49] sm:grid lg:absolute lg:inset-x-12 lg:bottom-5">
          <div className="flex items-center gap-3 border-r border-[#796aa3]/40 px-2 first:pl-0">
            <span className="text-2xl">♧</span>
            <span className="text-[9px] font-semibold leading-relaxed tracking-[0.12em]">
              {t("footerCurated")}
              <br />
              {t("footerCollectibles")}
            </span>
          </div>
          <div className="flex items-center gap-3 border-r border-[#796aa3]/40 px-4">
            <span className="text-2xl">◎</span>
            <span className="text-[9px] font-semibold leading-relaxed tracking-[0.12em]">
              {t("footerFanToFan")}
              <br />
              {t("footerCommunity")}
            </span>
          </div>
          <div className="flex items-center gap-3 border-r border-[#796aa3]/40 px-4">
            <span className="text-2xl">◇</span>
            <span className="text-[9px] font-semibold leading-relaxed tracking-[0.12em]">
              {t("footerThoughtful")}
              <br />
              {t("footerShopping")}
            </span>
          </div>
          <div className="flex items-center gap-3 px-4">
            <span className="text-2xl">✧</span>
            <span className="text-[9px] font-semibold leading-relaxed tracking-[0.12em]">
              {t("footerGlobal")}
              <br />
              {t("footerFanCommunity")}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
