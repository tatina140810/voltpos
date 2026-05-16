import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgCode, pinCode, setOrgCode, appendPin, clearPin, backspacePin, setAuth } = useAuthStore();
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post("/auth/org-login", { org_code: orgCode, pin_code: pinCode });
      return response.data as { access_token: string };
    },
    onSuccess: (data) => {
      setAuth(data.access_token);
      // Сбрасываем все кеши: настройки магазина (org-me), товары, остатки и т.д.
      // Без этого после смены пользователя/магазина старые данные ещё 5 минут
      // показываются (staleTime), и hasDelivery/hasInstallment врут.
      queryClient.clear();
      navigate("/sale");
    },
    onError: () => setError("Неверный org code или PIN"),
  });

  const onKeyPress = (key: string) => {
    if (key === "clear") return clearPin();
    if (key === "back") return backspacePin();
    appendPin(key);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-6">
      <section className="w-full rounded-2xl bg-white p-6 shadow-lg">
        <img
          src="/logo.png"
          alt="VoltPos"
          style={{ height: "140px", objectFit: "contain", marginBottom: "8px", display: "block", marginLeft: "auto", marginRight: "auto" }}
        />
        {(() => {
          const cached = typeof window !== "undefined" ? localStorage.getItem("voltpos_last_org_name") : null;
          return cached ? (
            <p className="text-center text-base font-semibold text-slate-800">{cached}</p>
          ) : null;
        })()}
        <p className="text-sm text-slate-500">Вход сотрудника</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-600">Org code</label>
            <input
              className="w-full rounded-xl border p-3 text-lg uppercase"
              value={orgCode}
              onChange={(e) => setOrgCode(e.target.value)}
              placeholder="Код магазина (6 символов)"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-600">PIN сотрудника</label>
            <div className="rounded-xl bg-slate-100 p-4 text-center text-2xl tracking-[0.4em]">
              {(pinCode || "").padEnd(4, "•")}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {keypad.map((key) => (
            <button
              key={key}
              className="rounded-xl border bg-white p-4 text-xl font-semibold active:scale-[0.98]"
              onClick={() => onKeyPress(key)}
            >
              {key === "clear" ? "C" : key === "back" ? "⌫" : key}
            </button>
          ))}
        </div>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        <button
          disabled={pinCode.length < 4 || loginMutation.isPending}
          onClick={() => loginMutation.mutate()}
          className="mt-5 w-full rounded-xl bg-primary p-4 text-lg font-semibold text-white disabled:opacity-50"
        >
          {loginMutation.isPending ? "Вход..." : "Войти в кассу"}
        </button>
      </section>
    </main>
  );
}
