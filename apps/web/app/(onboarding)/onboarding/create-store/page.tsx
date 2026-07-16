"use client";
import { useState } from "react";

export default function CreateStorePage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      window.location.href = `/dashboard/${data.id}`;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold text-gray-900">Creá tu tienda</h1>

        <input
          className="placeholder:text-gray-600 text-gray-600"
          placeholder="Nombre de la tienda"
          value={name}
          onChange={(e) => {
            const value = e.target.value;
            setName(value);
            setSlug(value);
          }}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {loading ? "Creando..." : "Crear tienda"}
        </button>
      </div>
    </div>
  );
}
