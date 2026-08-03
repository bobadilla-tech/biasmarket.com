"use client";

import { useParams } from "next/navigation";
import { CustomerLoginForm } from "@/features/customer-auth";

export function CustomerLoginPageClient() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <CustomerLoginForm slug={slug} />
    </div>
  );
}
