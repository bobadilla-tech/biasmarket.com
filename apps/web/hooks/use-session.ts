"use client";
import { authClient } from "@/lib/auth-client";

export function useSession() {
    const { data, isPending, error } = authClient.useSession();

    return {
        session: data?.session ?? null,
        user: data?.user ?? null,
        isPending,
        isAuthenticated: !!data?.session,
        error,
    };
}