"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useStore } from "@/lib/use-store";
import { DashboardNav } from "../dashboard-nav";

type SectionType = "COLLECTION" | "BANNER" | "TEXT_BLOCK";

interface Collection {
  id: string;
  name: string;
}

interface StoreSection {
  id: string;
  type: SectionType;
  collectionId: string | null;
  content: Record<string, string>;
  position: number;
}

export default function SectionsPage() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const { storeId, slug, loading: storeLoading } = useStore();
  const [sections, setSections] = useState<StoreSection[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [type, setType] = useState<SectionType>("COLLECTION");
  const [collectionId, setCollectionId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!storeId) return;
    try {
      const [sectionsData, collectionsData] = await Promise.all([
        apiFetch(`/stores/${storeId}/sections`, {}, tCommon("networkError")),
        apiFetch(`/stores/${storeId}/collections`, {}, tCommon("networkError")),
      ]);
      setSections(sectionsData);
      setCollections(collectionsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const content =
        type === "BANNER"
          ? { imageUrl, linkUrl: linkUrl || undefined }
          : type === "TEXT_BLOCK"
            ? { body }
            : {};
      await apiFetch(
        `/stores/${storeId}/sections`,
        {
          method: "POST",
          body: JSON.stringify({
            type,
            collectionId: type === "COLLECTION" ? collectionId : undefined,
            content,
          }),
        },
        tCommon("networkError"),
      );
      setCollectionId("");
      setImageUrl("");
      setLinkUrl("");
      setBody("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/stores/${storeId}/sections/${id}`, { method: "DELETE" }, tCommon("networkError"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReorder = async (index: number, direction: -1 | 1) => {
    const items = [...sections].sort((a, b) => a.position - b.position);
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    setError(null);
    try {
      await apiFetch(
        `/stores/${storeId}/sections/reorder`,
        { method: "PATCH", body: JSON.stringify({ sectionIds: items.map((i) => i.id) }) },
        tCommon("networkError"),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const collectionName = (id: string | null) => collections.find((c) => c.id === id)?.name ?? id;

  if (storeLoading) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-10 text-sm text-gray-500">
        {tCommon("loading")}
      </div>
    );
  }

  const ordered = [...sections].sort((a, b) => a.position - b.position);

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{t("sections.title")}</h1>
          <DashboardNav slug={slug} active="sections" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SectionType)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
          >
            <option value="COLLECTION">{t("sections.collection")}</option>
            <option value="BANNER">{t("sections.banner")}</option>
            <option value="TEXT_BLOCK">{t("sections.textBlock")}</option>
          </select>

          {type === "COLLECTION" && (
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
            >
              <option value="">{t("sections.selectCollection")}</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {type === "BANNER" && (
            <>
              <input
                placeholder={t("sections.imageUrlPlaceholder")}
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
              />
              <input
                placeholder={t("sections.linkUrlPlaceholder")}
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
              />
            </>
          )}

          {type === "TEXT_BLOCK" && (
            <textarea
              placeholder={t("sections.bodyPlaceholder")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
            />
          )}

          <button
            onClick={handleCreate}
            disabled={
              loading ||
              (type === "COLLECTION" && !collectionId) ||
              (type === "BANNER" && !imageUrl) ||
              (type === "TEXT_BLOCK" && !body)
            }
            className="self-start rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {t("sections.add")}
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {ordered.map((s, index) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-6 py-3 text-gray-900">
                    {t(`sections.${s.type === "COLLECTION" ? "collection" : s.type === "BANNER" ? "banner" : "textBlock"}`)}
                    {s.type === "COLLECTION" && `: ${collectionName(s.collectionId)}`}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleReorder(index, -1)}
                        disabled={index === 0}
                        className="px-2 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40"
                      >
                        {t("sections.moveUp")}
                      </button>
                      <button
                        onClick={() => handleReorder(index, 1)}
                        disabled={index === ordered.length - 1}
                        className="px-2 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40"
                      >
                        {t("sections.moveDown")}
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                      >
                        {t("sections.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
