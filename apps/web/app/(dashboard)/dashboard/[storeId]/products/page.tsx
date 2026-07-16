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
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    loadProducts();
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (id: string) => {
    await apiFetch(`/stores/${storeId}/products/${id}/publish`, { method: "PATCH" });
    await loadProducts();
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/stores/${storeId}/products/${id}`, { method: "DELETE" });
    await loadProducts();
  };

  return (
    <div>
      <h1>Productos</h1>

      <div style={{ marginBottom: 24, display: "flex", gap: 8 }}>
        <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input placeholder="Precio" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button onClick={handleCreate} disabled={loading || !name || !price}>
          {loading ? "Creando..." : "Agregar producto"}
        </button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <table border={1} cellPadding={8}>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Precio</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>${p.price}</td>
              <td>{p.status}</td>
              <td>
                {p.status === "DRAFT" && (
                  <button onClick={() => handlePublish(p.id)}>Publicar</button>
                )}
                <button onClick={() => handleDelete(p.id)}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
