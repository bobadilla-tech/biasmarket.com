import type { ProductSearchResultResponseDto } from "@biasmarket/types";
import type { LandingStore } from "@/features/discovery/server";
import { Footer } from "@/components/marketing/footer";
import { AboutSection } from "./about-section";
import { BlogSection } from "./blog-section";
import { CategoriesSection } from "./categories-section";
import { DiscoverSection } from "./discover-section";
import { Faq } from "./faq";
import { Hero } from "./hero";
import { StoresSection } from "./stores-section";
import { TrendsSection } from "./trends-section";

export function LandingPage({
  latestProducts = null,
  bestSellers = null,
  discoverProducts = null,
  featuredStores = null,
}: {
  latestProducts?: ProductSearchResultResponseDto | null;
  bestSellers?: ProductSearchResultResponseDto | null;
  discoverProducts?: ProductSearchResultResponseDto | null;
  featuredStores?: LandingStore[] | null;
}) {
  return (
    <div className="landing-theme min-h-screen bg-background text-foreground">
      <Hero />
      <CategoriesSection />
      <TrendsSection
        latestInitialData={latestProducts}
        bestSellersInitialData={bestSellers}
      />
      <BlogSection />
      <DiscoverSection initialData={discoverProducts} />
      <StoresSection stores={featuredStores} />
      <AboutSection />
      {/* The FAQ accordion is a desktop-only section — the mobile design goes
          straight from "¿Qué es BIASMARKET?" to the help-center CTA/footer. */}
      <div className="hidden lg:block">
        <Faq />
      </div>
      <Footer />
    </div>
  );
}
