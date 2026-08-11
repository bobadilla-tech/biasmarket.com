import { Footer } from "@/components/marketing/footer";
import { AboutSection } from "./about-section";
import { CategoriesSection } from "./categories-section";
import { DiscoverSection } from "./discover-section";
import { Faq } from "./faq";
import { Hero } from "./hero";
import { TrendsSection } from "./trends-section";

export function LandingPage() {
  return (
    <div className="landing-theme min-h-screen bg-background text-foreground">
      <Hero />
      <TrendsSection />
      <CategoriesSection />
      <DiscoverSection />
      <AboutSection />
      <Faq />
      <Footer />
    </div>
  );
}
