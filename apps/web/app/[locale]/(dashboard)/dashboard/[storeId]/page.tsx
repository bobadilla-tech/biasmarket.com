import { redirect } from "next/navigation";

export default async function DashboardHome({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  redirect(`/dashboard/${storeId}/products`);
}
