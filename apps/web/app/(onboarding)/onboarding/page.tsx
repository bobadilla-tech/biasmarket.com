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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-5 ">
        <h1 className="text-2xl font-bold text-gray-900">Crear cuenta</h1>
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
        />
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSignup}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
        >
          Registrarme
        </button>

        <p className="text-center text-sm text-gray-500">
          ¿Ya tienes cuenta?{" "}
          <a
            href="/login"
            className="text-emerald-600 font-medium hover:underline"
          >
            Iniciar sesión
          </a>
        </p>
      </div>
    </div>
  );
}
