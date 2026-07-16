"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function OnboardingPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async () => {
    const { error } = await authClient.signUp.email({
      email,
      password,
      name,
      // @ts-expect-error - additionalField custom
      role: "seller",
    });
    if (error) setError(error.message ?? "Error al registrarse");
    else window.location.href = "/onboarding/create-store";
  };

  return (
    <div>
      <h1>Crear cuenta</h1>
      <input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
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
      <button onClick={handleSignup}>Registrarme</button>
      <p>
        ¿Ya tenés cuenta? <a href="/login">Iniciar sesión</a>
      </p>
      ;
    </div>
  );
}
