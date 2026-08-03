"use client";

import { useParams } from "next/navigation";
import { ForgotPasswordForm } from "@/features/customer-auth";

export function ForgotPasswordPageClient() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <ForgotPasswordForm slug={slug} />
    </div>
  );
}
