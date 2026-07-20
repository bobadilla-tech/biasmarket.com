async function getStore(slug: string) {

  const url = `${process.env.NEXT_PUBLIC_API_URL}/api/stores/${slug}/public`;
  console.log(url)
  
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stores/${slug}/public`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStore(slug);

  if (!store) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Tienda no encontrada.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        {store.products.length === 0 ? (
          <p className="text-gray-500 text-center">
            Todavía no hay productos publicados.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {store.products.map((product: any) => (
              <a
                key={product.id}
                href={`/store/${slug}/products/${product.id}`}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition"
              >
                <div className="aspect-square bg-gray-100 rounded-lg mb-3" />
                <p className="font-semibold text-gray-900 text-sm">{product.name}</p>
                <p className="text-emerald-600 font-bold text-sm">${product.price}</p>
                {product.soldOut && (
                  <span className="text-xs text-red-500 font-semibold">Agotado</span>
                )}
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
