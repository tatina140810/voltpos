import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { superApi } from "../../lib/superApi";
import { useSuperAuthStore, SuperAdmin } from "../../store/superAuth";

type LoginResponse = {
  access_token: string;
  token_type: string;
  admin: SuperAdmin;
};

export function SuperLoginPage() {
  const navigate = useNavigate();
  const setAuth = useSuperAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await superApi.post<LoginResponse>("/super/auth/login", { email, password });
      return response.data;
    },
    onSuccess: (data) => {
      setAuth(data.access_token, data.admin);
      navigate("/super");
    },
    onError: () => setError("Неверный email или пароль"),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    loginMutation.mutate();
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-6">
      <section className="w-full rounded-2xl bg-white p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-800">VoltPos · Платформа</h1>
        <p className="mt-1 text-sm text-slate-500">Панель администратора платформы</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-sm text-slate-600">Email</label>
            <input
              type="email"
              className="w-full rounded-xl border p-3 text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">Пароль</label>
            <input
              type="password"
              className="w-full rounded-xl border p-3 text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full rounded-xl bg-slate-900 p-4 text-lg font-semibold text-white disabled:opacity-50"
          >
            {loginMutation.isPending ? "Вход..." : "Войти"}
          </button>
        </form>
      </section>
    </main>
  );
}
