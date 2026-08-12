import { Cta } from "./cta";
import { Faq } from "./faq";
import { FeaturedStoresSection } from "./featured-stores-section";
import { Features } from "./features";
import { FinalHook } from "./final-hook";
import { ForSellersFooter } from "./footer";
import { Hero } from "./hero";
import { Problem } from "./problem";
import { SocialProof } from "./social-proof";
import { Solution } from "./solution";

export function ForSellersPage() {
  return (
    <div className="for-sellers-theme min-h-screen bg-background text-foreground">
      <Hero />
      <Problem />
      <Solution />
      <FeaturedStoresSection />
      <Features />
      <SocialProof />
      <Cta />
      <Faq />
      <FinalHook />
      <ForSellersFooter />
    </div>
  );
}
