"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Store {
  id: string;
  name: string;
  slug: string;
}

export default function CreateStorePage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStores = async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/me/stores`,
        {
          credentials: "include",
        },
      );
      const data = await res.json();
      if (res.ok) setStores(data);
    } finally {
      setLoadingStores(false);
    }
  };

  useEffect(() => {
    loadStores();
  }, []);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Error al crear la tienda");
        return;
      }
      setStores((prev) => [...prev, data]);
      setName("");
      setSlug("");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStore = async (storeId: string) => {
    if (!confirm("¿Seguro que querés eliminar esta tienda?")) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/stores/${storeId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.message ?? "Error al eliminar la tienda");
        return;
      }
      setStores((prev) => prev.filter((s) => s.id !== storeId));
    } catch {
      alert("Error de red al eliminar");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold text-gray-900">Tus tiendas</h1>

        {loadingStores && <p className="text-sm text-gray-500">Cargando...</p>}

        {!loadingStores && stores.length === 0 && (
          <p className="text-sm text-gray-500">
            Todavía no tenés ninguna tienda. Creá la primera abajo.
          </p>
        )}

        {stores.length > 0 && (
          <div className="flex flex-col gap-2">
            {stores.map((store) => (
              <div
                key={store.id}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 hover:border-emerald-400 hover:bg-emerald-50 transition flex items-center justify-between"
              >
                <button
                  onClick={() => router.push(`/dashboard/${store.id}/products`)}
                  className="text-left flex-1"
                >
                  <p className="font-semibold text-gray-900">{store.name}</p>
                  <p className="text-xs text-gray-500">/{store.slug}</p>
                </button>
                <button
                  onClick={() => handleDeleteStore(store.id)}
                  className="text-red-500 text-xs font-semibold hover:text-red-700 ml-2"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}

        <hr className="border-gray-100" />

        <h2 className="text-sm font-semibold text-gray-700">
          Crear nueva tienda
        </h2>

        <input
          className="placeholder:text-gray-400 text-gray-900 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-400"
          placeholder="Nombre de la tienda"
          value={name}
          onChange={(e) => {
            const value = e.target.value;
            setName(value);
            setSlug(
              value
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, "-"),
            );
          }}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={loading || !name}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {loading ? "Creando..." : "Crear tienda"}
        </button>
      </div>
    </div>
  );
}
