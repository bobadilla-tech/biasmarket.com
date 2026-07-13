export default function StorePage({ params }: { params: { slug: string } }) {
  return <div>Store: {params.slug}</div>;
}
