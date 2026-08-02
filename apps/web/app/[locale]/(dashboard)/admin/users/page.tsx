"use client";

import { useTranslations } from "next-intl";
import { useAdminUsers, useToggleUserBan, AdminUsersTable, type AdminUser } from "@/features/admin";

export default function AdminUsersPage() {
  const t = useTranslations("admin.users");
  const tCommon = useTranslations("common");
  const usersQuery = useAdminUsers(tCommon("networkError"));
  const toggleBan = useToggleUserBan();

  const users = usersQuery.data?.users ?? [];
  const storeCounts = usersQuery.data?.storeCounts ?? {};
  const error = usersQuery.error instanceof Error
    ? usersQuery.error.message
    : toggleBan.error instanceof Error
      ? toggleBan.error.message
      : null;

  const handleToggleBan = (user: AdminUser) => {
    toggleBan.mutate({ userId: user.id, banned: !!user.banned });
  };

  if (usersQuery.isPending) {
    return <div className="px-6 py-10 text-sm text-gray-500">{tCommon("loading")}</div>;
  }

  return (
    <div className="bg-gray-50 px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {!error && users.length === 0 && <p className="text-sm text-gray-500">{t("empty")}</p>}

        {users.length > 0 && (
          <AdminUsersTable
            users={users}
            storeCounts={storeCounts}
            pendingUserId={toggleBan.isPending ? (toggleBan.variables?.userId ?? null) : null}
            onToggleBan={handleToggleBan}
          />
        )}
      </div>
    </div>
  );
}
