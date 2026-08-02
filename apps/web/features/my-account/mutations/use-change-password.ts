"use client";

import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import type { ChangePasswordInput } from "../schemas/change-password.schema";

export function useChangePassword(fallbackErrorMessage: string) {
  return useMutation({
    mutationFn: async ({ confirmPassword: _confirmPassword, ...values }: ChangePasswordInput) => {
      const { data, error } = await authClient.changePassword({
        ...values,
        revokeOtherSessions: true,
      });
      if (error) {
        throw new Error(error.message ?? fallbackErrorMessage);
      }
      return data;
    },
  });
}
