"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message ?? "Email o contraseña incorrectos");
      return;
    }
    window.location.href = "/onboarding/create-store";
  };

  return (
    <div>
      <h1>Iniciar sesión</h1>
      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button onClick={handleLogin} disabled={loading}>
        {loading ? "Ingresando..." : "Ingresar"}
      </button>
      <p>
        ¿No tenés cuenta? <a href="/onboarding">Registrate</a>
      </p>
    </div>
  );
}
