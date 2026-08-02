"use client";

import { useTranslations } from "next-intl";
import type { AdminUser } from "../schemas/admin-user.schema";

interface AdminUsersTableProps {
  users: AdminUser[];
  storeCounts: Record<string, number>;
  pendingUserId: string | null;
  onToggleBan: (user: AdminUser) => void;
}

export function AdminUsersTable({
  users,
  storeCounts,
  pendingUserId,
  onToggleBan,
}: AdminUsersTableProps) {
  const t = useTranslations("admin.users");
  const tCommon = useTranslations("common");

  return (
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
                  onClick={() => onToggleBan(user)}
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
  );
}
