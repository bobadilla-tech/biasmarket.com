export function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-center text-3xl font-bold text-black sm:text-4xl">
      <span aria-hidden="true" className="text-[#A24CF0]">
        ✦
      </span>
      {title}
      <span aria-hidden="true" className="text-[#A24CF0]">
        ✦
      </span>
    </h2>
  );
}
