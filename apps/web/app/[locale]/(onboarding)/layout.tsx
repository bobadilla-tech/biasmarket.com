export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main id="main-content" tabIndex={-1}>
      {children}
    </main>
  );
}
