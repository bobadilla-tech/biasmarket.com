"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role?: string | null;
  banned?: boolean | null;
}

interface StoreCount {
  userId: string;
  storeCount: number;
}

export default function AdminUsersPage() {
  const t = useTranslations("admin.users");
  const tCommon = useTranslations("common");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [storeCounts, setStoreCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [usersResult, counts] = await Promise.all([
        authClient.admin.listUsers({ query: { limit: 100, sortBy: "createdAt", sortDirection: "desc" } }),
        apiFetch("/admin/users/store-counts", {}, tCommon("networkError")) as Promise<StoreCount[]>,
      ]);
      if (usersResult.error) throw new Error(usersResult.error.message ?? tCommon("networkError"));
      setUsers(usersResult.data?.users ?? []);
      setStoreCounts(Object.fromEntries(counts.map((c) => [c.userId, c.storeCount])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleBan = async (user: AdminUser) => {
    setPendingUserId(user.id);
    try {
      if (user.banned) {
        await authClient.admin.unbanUser({ userId: user.id });
      } else {
        await authClient.admin.banUser({ userId: user.id });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingUserId(null);
    }
  };

  if (loading) {
    return <div className="px-6 py-10 text-sm text-gray-500">{tCommon("loading")}</div>;
  }

  return (
    <div className="bg-gray-50 px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {!error && users.length === 0 && <p className="text-sm text-gray-500">{t("empty")}</p>}

        {users.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-6 py-3 font-medium">{t("table.name")}</th>
                  <th className="px-6 py-3 font-medium">{t("table.email")}</th>
                  <th className="px-6 py-3 font-medium">{t("table.role")}</th>
                  <th className="px-6 py-3 font-medium">{t("table.stores")}</th>
                  <th className="px-6 py-3 font-medium">{t("table.status")}</th>
                  <th className="px-6 py-3 font-medium">{t("table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-100 align-top last:border-0">
                    <td className="px-6 py-3 text-gray-900">{user.name ?? "—"}</td>
                    <td className="px-6 py-3 text-gray-600">{user.email}</td>
                    <td className="px-6 py-3 text-gray-600">{user.role ?? "seller"}</td>
                    <td className="px-6 py-3 text-gray-600">{storeCounts[user.id] ?? 0}</td>
                    <td className="px-6 py-3">
                      {user.banned ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                          {t("status.banned")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          {t("status.active")}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => handleToggleBan(user)}
                        disabled={pendingUserId === user.id || user.role === "admin"}
                        className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-700 disabled:opacity-40"
                      >
                        {pendingUserId === user.id
                          ? tCommon("loading")
                          : user.banned
                            ? t("actions.unban")
                            : t("actions.ban")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
