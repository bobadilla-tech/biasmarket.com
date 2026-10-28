export function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-center text-3xl font-bold text-landing-ink sm:text-4xl">
      <span aria-hidden="true" className="text-brand-violet">
        ✦
      </span>
      {title}
      <span aria-hidden="true" className="text-brand-violet">
        ✦
      </span>
    </h2>
  );
}
