"use client";
import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSession } from "./use-session";

export function useRequireAuth() {
  const router = useRouter();

  const { isPending, isAuthenticated } = useSession();

  useEffect(() => {
    if (!isPending && !isAuthenticated) {
      router.push("/login");
    }
  }, [isPending, isAuthenticated, router]);

  // isReady = "safe to render the authenticated content now." Callers must
  // return null (or otherwise not render tenant-data-fetching children) while
  // this is false — the useEffect above only fires the redirect, it doesn't
  // stop the current render from happening first.
  return { isPending, isAuthenticated, isReady: !isPending && isAuthenticated };
}
