import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, FileText, LogOut, Play } from "lucide-react";

import { api } from "../lib/api";

type Shift = {
  id: number;
  cashier_id: number;
  opened_at: string;
  closed_at: string | null;
  opening_cash: string;
  closing_cash_actual: string | null;
  status: "open" | "closed";
  notes: string | null;
};

type ShiftReport = {
  shift: Shift;
  totals: {
    sales_count: number;
    returned_count: number;
    sales_total: string;
    cash_in: string;
    card_in: string;
    transfer_in: string;
    inkas: string;
    opening_cash: string;
    expected_cash: string;
  };
  report_kind: "X" | "Z";
  discrepancy: string | null;
};

function fmt(v: string | number): string {
  return Number(v || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function ShiftWidget() {
  const qc = useQueryClient();
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [reportShown, setReportShown] = useState<ShiftReport | null>(null);
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");

  const currentQuery = useQuery({
    queryKey: ["shifts-current"],
    queryFn: async () => (await api.get("/shifts/current")).data as { shift: Shift | null },
    refetchInterval: 60000,
  });

  const shift = currentQuery.data?.shift ?? null;

  const openMutation = useMutation({
    mutationFn: async () => {
      await api.post("/shifts/open", { opening_cash: Number(openingCash) || 0 });
    },
    onSuccess: () => {
      setOpenModal(false);
      setOpeningCash("0");
      qc.invalidateQueries({ queryKey: ["shifts-current"] });
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number; data?: { detail?: string } } }).response?.status;
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      alert(status === 409 ? (detail || "Смена уже открыта") : "Не удалось открыть смену");
    },
  });

  const xReportMutation = useMutation({
    mutationFn: async () => {
      if (!shift) throw new Error("no shift");
      return (await api.get(`/shifts/${shift.id}/report`)).data as ShiftReport;
    },
    onSuccess: (data) => setReportShown(data),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      return (await api.post("/shifts/close", { closing_cash_actual: Number(closingCash) || 0 })).data as ShiftReport;
    },
    onSuccess: (data) => {
      setCloseModal(false);
      setClosingCash("");
      setReportShown(data);
      qc.invalidateQueries({ queryKey: ["shifts-current"] });
    },
    onError: () => alert("Не удалось закрыть смену"),
  });

  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <Clock size={16} className={shift ? "text-emerald-600" : "text-slate-400"} />
          {shift ? (
            <>
              <span className="font-semibold text-emerald-700">Смена открыта</span>
              <span className="text-slate-500">с {fmtTime(shift.opened_at)}</span>
              <span className="text-slate-500">· касса {fmt(shift.opening_cash)} сом</span>
            </>
          ) : (
            <span className="text-slate-500">Смена не открыта</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {shift ? (
            <>
              <button
                type="button"
                onClick={() => xReportMutation.mutate()}
                disabled={xReportMutation.isPending}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
              >
                <FileText size={14} /> X-отчёт
              </button>
              <button
                type="button"
                onClick={() => setCloseModal(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
              >
                <LogOut size={14} /> Закрыть смену
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setOpenModal(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Play size={14} /> Открыть смену
            </button>
          )}
        </div>
      </div>

      {/* Модалка открытия смены */}
      {openModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold">Открыть смену</h3>
            <label className="mb-1 block text-xs text-slate-500">Сколько наличных в кассе на старте</label>
            <input
              type="text"
              inputMode="decimal"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              onFocus={(e) => { if (e.target.value === "0") setOpeningCash(""); }}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-right tabular-nums"
            />
            <p className="mt-1 text-xs text-slate-500">Сом. Это «остаток на старте» — от него считаются итоги смены.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => openMutation.mutate()}
                disabled={openMutation.isPending}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {openMutation.isPending ? "Открываю…" : "Открыть"}
              </button>
              <button
                type="button"
                onClick={() => setOpenModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Модалка закрытия смены */}
      {closeModal && shift ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold">Закрыть смену</h3>
            <label className="mb-1 block text-xs text-slate-500">Сколько наличных по факту в кассе сейчас</label>
            <input
              type="text"
              inputMode="decimal"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              placeholder="0"
              autoFocus
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-right tabular-nums"
            />
            <p className="mt-1 text-xs text-slate-500">
              Пересчитай наличные руками и впиши. Система покажет расхождение с расчётным остатком.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending || closingCash === ""}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {closeMutation.isPending ? "Закрываю…" : "Закрыть и получить Z-отчёт"}
              </button>
              <button
                type="button"
                onClick={() => setCloseModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Отчёт X или Z */}
      {reportShown ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setReportShown(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  {reportShown.report_kind === "Z" ? "Z-отчёт (закрытие)" : "X-отчёт (промежуточный)"}
                </h3>
                <p className="text-xs text-slate-500">
                  Смена #{reportShown.shift.id} · открыта {fmtTime(reportShown.shift.opened_at)}
                  {reportShown.shift.closed_at ? ` · закрыта ${fmtTime(reportShown.shift.closed_at)}` : ""}
                </p>
              </div>
              <button onClick={() => setReportShown(null)} className="text-2xl text-slate-500" aria-label="Закрыть">×</button>
            </div>

            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b"><td className="py-2 text-slate-600">Продаж</td><td className="py-2 text-right tabular-nums font-semibold">{reportShown.totals.sales_count}</td></tr>
                <tr className="border-b"><td className="py-2 text-slate-600">Возвратов</td><td className="py-2 text-right tabular-nums">{reportShown.totals.returned_count}</td></tr>
                <tr className="border-b bg-slate-50"><td className="py-2 text-slate-600">Сумма продаж</td><td className="py-2 text-right tabular-nums font-bold">{fmt(reportShown.totals.sales_total)}</td></tr>
                <tr className="border-b"><td className="py-2 text-slate-600">💵 Наличными</td><td className="py-2 text-right tabular-nums">{fmt(reportShown.totals.cash_in)}</td></tr>
                <tr className="border-b"><td className="py-2 text-slate-600">💳 Картой</td><td className="py-2 text-right tabular-nums">{fmt(reportShown.totals.card_in)}</td></tr>
                <tr className="border-b"><td className="py-2 text-slate-600">📱 Переводом</td><td className="py-2 text-right tabular-nums">{fmt(reportShown.totals.transfer_in)}</td></tr>
                <tr className="border-b"><td className="py-2 text-slate-600">Инкассация</td><td className="py-2 text-right tabular-nums text-red-700">−{fmt(reportShown.totals.inkas)}</td></tr>
                <tr className="border-b bg-slate-50"><td className="py-2 text-slate-600">Касса на старте</td><td className="py-2 text-right tabular-nums">{fmt(reportShown.totals.opening_cash)}</td></tr>
                <tr className="border-b bg-emerald-50"><td className="py-2 font-semibold">Должно быть наличных</td><td className="py-2 text-right tabular-nums text-base font-bold text-emerald-700">{fmt(reportShown.totals.expected_cash)}</td></tr>
                {reportShown.shift.closing_cash_actual !== null ? (
                  <>
                    <tr className="border-b"><td className="py-2 text-slate-600">Факт. в кассе</td><td className="py-2 text-right tabular-nums font-semibold">{fmt(reportShown.shift.closing_cash_actual)}</td></tr>
                    <tr>
                      <td className="py-3 font-semibold">Расхождение</td>
                      <td className={`py-3 text-right tabular-nums text-base font-bold ${
                        Number(reportShown.discrepancy) === 0 ? "text-emerald-700"
                        : Number(reportShown.discrepancy) > 0 ? "text-amber-700"
                        : "text-red-700"
                      }`}>
                        {Number(reportShown.discrepancy) > 0 ? "+" : ""}{fmt(reportShown.discrepancy ?? "0")}
                      </td>
                    </tr>
                  </>
                ) : null}
              </tbody>
            </table>

            <button
              type="button"
              onClick={() => setReportShown(null)}
              className="mt-4 w-full rounded-lg bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200"
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
