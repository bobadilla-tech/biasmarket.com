"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  status: "DRAFT" | "PUBLISHED";
  soldOut: boolean;
}

export default function ProductsPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadProducts = async () => {
    try {
      const data = await apiFetch(`/stores/${storeId}/products`);
      setProducts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const data = await apiFetch(`/stores/${storeId}/products`);
        if (!ignore) setProducts(data);
      } catch (e) {
        if (!ignore) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      ignore = true;
    };
  }, [storeId]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/stores/${storeId}/products`, {
        method: "POST",
        body: JSON.stringify({ name, description, price: parseFloat(price) }),
      });
      setName("");
      setDescription("");
      setPrice("");
      await loadProducts();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (id: string) => {
    await apiFetch(`/stores/${storeId}/products/${id}/publish`, {
      method: "PATCH",
    });
    await loadProducts();
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/stores/${storeId}/products/${id}`, { method: "DELETE" });
    await loadProducts();
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">Productos</h1>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-wrap gap-3 items-center ">
          <input
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-[160px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
          />
          <input
            placeholder="Descripción"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 min-w-[160px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
          />
          <input
            placeholder="Precio"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-32 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
          />
          <button
            onClick={handleCreate}
            disabled={loading || !name || !price}
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {loading ? "Creando..." : "Agregar producto"}
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-6 py-3 font-medium">Nombre</th>
                <th className="px-6 py-3 font-medium">Precio</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="px-6 py-3 text-gray-900">{p.name}</td>
                  <td className="px-6 py-3 text-gray-900">${p.price}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        p.status === "PUBLISHED"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-2">
                      {p.status === "DRAFT" && (
                        <button
                          onClick={() => handlePublish(p.id)}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600"
                        >
                          Publicar
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
