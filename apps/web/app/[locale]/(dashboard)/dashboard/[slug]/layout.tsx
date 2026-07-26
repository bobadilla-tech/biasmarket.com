import { StoreThemeFrame } from "@/components/dashboard/store-theme-frame";

export default async function StoreDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <StoreThemeFrame slug={slug}>{children}</StoreThemeFrame>
  );
}
