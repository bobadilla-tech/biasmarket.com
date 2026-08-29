import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { StoreLogo } from "@/components/store-logo";
import type { StoreResponseDto } from "@biasmarket/types";

export function StoreLinkCard({ store }: { store: StoreResponseDto }) {
  return (
    <Link href={`/dashboard/${store.slug}`} aria-label={store.name}>
      <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm transition hover:shadow-md">
        <CardContent className="flex items-center gap-4 px-5 py-5">
          <StoreLogo
            name={store.name}
            logoUrl={store.logoUrl}
            size={44}
            className="text-sm font-semibold"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#2d1649]">
              {store.name}
            </p>
            <p className="truncate text-xs text-[#8f7da8]">/{store.slug}</p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-[#8f7da8]" />
        </CardContent>
      </Card>
    </Link>
  );
}
