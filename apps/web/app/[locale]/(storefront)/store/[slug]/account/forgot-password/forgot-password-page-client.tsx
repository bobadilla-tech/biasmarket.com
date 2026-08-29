"use client";

import { useParams } from "next/navigation";
import { ForgotPasswordForm } from "@/features/customer-auth";

export function ForgotPasswordPageClient() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <div className="min-h-dvh flex items-start justify-center bg-gray-50 px-6 py-10 sm:items-center">
      <ForgotPasswordForm slug={slug} />
    </div>
  );
}
