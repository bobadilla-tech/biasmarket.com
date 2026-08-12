import { Heart, Sparkles, Star } from "lucide-react";

const cards = [
  { rotate: "-rotate-12", translate: "-translate-x-16", icon: Star },
  { rotate: "rotate-2", translate: "translate-x-0", icon: Sparkles },
  { rotate: "rotate-12", translate: "translate-x-16", icon: Heart },
];

export function PhotocardStack() {
  return (
    <div className="relative mx-auto h-72 w-full max-w-xs">
      {cards.map(({ rotate, translate, icon: Icon }, i) => (
        <div
          key={i}
          className={`absolute inset-x-0 top-0 mx-auto aspect-[3/4] w-40 rounded-2xl bg-gradient-to-br from-brand-pink via-brand-violet to-brand-gold p-[3px] shadow-[0_20px_60px_-15px_oklch(0.66_0.25_350_/_0.5)] ${rotate} ${translate}`}
          style={{ zIndex: i }}
        >
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-[1rem] bg-brand-ink/90">
            <Icon className="size-6 text-white/70" />
            <span className="text-[10px] font-semibold tracking-[0.3em] text-white/40">
              PHOTOCARD
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
