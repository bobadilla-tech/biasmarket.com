import { Navbar } from "@/components/marketing/navbar";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
