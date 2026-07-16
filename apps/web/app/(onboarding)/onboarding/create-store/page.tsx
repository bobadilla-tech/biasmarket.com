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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // manda la cookie de sesión
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
    <div>
      <h1>Creá tu tienda</h1>
      <input
        placeholder="Nombre de la tienda"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        placeholder="URL (slug), ej: mi-tienda"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
      />
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button onClick={handleCreate} disabled={loading}>
        {loading ? "Creando..." : "Crear tienda"}
      </button>
    </div>
  );
}
