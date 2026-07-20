import { Cta } from "./cta";
import { Faq } from "./faq";
import { Features } from "./features";
import { FinalHook } from "./final-hook";
import { Hero } from "./hero";
import { Problem } from "./problem";
import { SocialProof } from "./social-proof";
import { Solution } from "./solution";

export function LandingPage() {
  return (
    <div className="landing-theme min-h-screen bg-background text-foreground">
      <Hero />
      <Problem />
      <Solution />
      <Features />
      <SocialProof />
      <Cta />
      <Faq />
      <FinalHook />
    </div>
  );
}
