"use client";

import { useTranslations } from "next-intl";
import type { StoreWithOwnerResponseDto } from "@biasmarket/types";

interface AdminStoresTableProps {
  stores: StoreWithOwnerResponseDto[];
  impersonatingUserId: string | null;
  onImpersonate: (store: StoreWithOwnerResponseDto) => void;
}

export function AdminStoresTable(
  { stores, impersonatingUserId, onImpersonate }: AdminStoresTableProps,
) {
  const t = useTranslations("admin.stores");

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
            <th className="px-6 py-3 font-medium">{t("table.name")}</th>
            <th className="px-6 py-3 font-medium">{t("table.slug")}</th>
            <th className="px-6 py-3 font-medium">{t("table.owner")}</th>
            <th className="px-6 py-3 font-medium">{t("table.locale")}</th>
            <th className="px-6 py-3 font-medium">{t("table.socials")}</th>
            <th className="px-6 py-3 font-medium">{t("table.createdAt")}</th>
            <th className="px-6 py-3 font-medium">{t("table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((store) => {
            const isImpersonating = impersonatingUserId === store.owner.id;
            const socials = [
              { name: "Instagram", url: store.instagramUrl },
              { name: "Facebook", url: store.facebookUrl },
              { name: "TikTok", url: store.tiktokUrl },
              { name: "Twitter", url: store.twitterUrl },
            ].filter((s) => Boolean(s.url));

            return (
              <tr
                key={store.id}
                className="border-b border-gray-100 align-top last:border-0"
              >
                <td className="px-6 py-3 text-gray-900">{store.name}</td>
                <td className="px-6 py-3 text-gray-600">{store.slug}</td>
                <td className="px-6 py-3 text-gray-600">
                  {store.owner.name ?? store.owner.email}
                  <div className="text-xs text-gray-400">
                    {store.owner.email}
                  </div>
                </td>
                <td className="px-6 py-3 text-gray-600">
                  <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase text-gray-700">
                    {store.locale || "es"}
                  </span>
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {socials.length > 0
                    ? (
                      <div className="flex flex-wrap gap-1.5">
                        {socials.map((s) => (
                          <a
                            key={s.name}
                            href={s.url!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-purple-600 hover:underline"
                          >
                            {s.name}
                          </a>
                        ))}
                      </div>
                    )
                    : <span className="text-xs text-gray-400">-</span>}
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {new Date(store.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-3">
                  <button
                    onClick={() => onImpersonate(store)}
                    disabled={isImpersonating}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {isImpersonating
                      ? t("actions.impersonating")
                      : t("actions.impersonate")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
