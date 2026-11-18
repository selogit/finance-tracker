"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type Category,
  type MonthlyCategoryStat,
  type Transaction,
  fetchCategories,
  fetchMonthlyAnalytics,
  fetchTransactions,
  updateTransactionCategory,
  uploadCsvStatement,
} from "@/lib/api";

const formatPLN = (value: string | number) =>
  new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(Number(value));

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [analytics, setAnalytics] = useState<MonthlyCategoryStat[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadAllData = useCallback(async (catFilter?: number) => {
    setLoading(true);
    try {
      const [txs, cats, stats] = await Promise.all([
        fetchTransactions(catFilter),
        fetchCategories(),
        fetchMonthlyAnalytics(),
      ]);
      setTransactions(txs);
      setCategories(cats);
      setAnalytics(stats);
    } catch (err) {
      console.error(err);
      setStatusMessage("Błąd połączenia z API. Upewnij się, że backend działa na porcie 8000.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData(selectedCategoryId);
  }, [loadAllData, selectedCategoryId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatusMessage(null);
    try {
      const summary = await uploadCsvStatement(file);
      setStatusMessage(
        `Zaimportowano: ${summary.imported_count} nowych transakcji (pominięto duplikaty: ${summary.skipped_duplicates}).`
      );
      await loadAllData(selectedCategoryId);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Błąd podczas importu.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleCategoryChange = async (txId: number, newCatValue: string) => {
    const categoryId = newCatValue === "" ? null : Number(newCatValue);
    try {
      await updateTransactionCategory(txId, categoryId);
      await loadAllData(selectedCategoryId);
    } catch (err) {
      console.error(err);
    }
  };

  const kpis = useMemo(() => {
    let income = 0;
    let expenses = 0;
    for (const tx of transactions) {
      const val = Number(tx.amount);
      if (val >= 0) income += val;
      else expenses += Math.abs(val);
    }
    return { income, expenses, balance: income - expenses };
  }, [transactions]);

  const expensesByMonth = useMemo(() => {
    const grouped: Record<string, MonthlyCategoryStat[]> = {};
    for (const item of analytics) {
      if (Number(item.total) < 0) {
        if (!grouped[item.month]) grouped[item.month] = [];
        grouped[item.month].push(item);
      }
    }
    return grouped;
  }, [analytics]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Personal Finance Analyzer</h1>
            <p className="text-sm text-slate-400">
              Import wyciągów CSV, automatyczna kategoryzacja i analiza przepływów
            </p>
          </div>

          <label className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm cursor-pointer transition">
            {uploading ? "Przetwarzanie..." : "Wgraj wyciąg CSV"}
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </header>

        {statusMessage && (
          <div className="p-4 rounded-lg bg-slate-900 border border-slate-700 text-sm text-emerald-400">
            {statusMessage}
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-xs uppercase tracking-wider text-slate-400">Przychody</p>
            <p className="text-2xl font-semibold text-emerald-400 mt-1">{formatPLN(kpis.income)}</p>
          </div>
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-xs uppercase tracking-wider text-slate-400">Wydatki</p>
            <p className="text-2xl font-semibold text-rose-400 mt-1">{formatPLN(kpis.expenses)}</p>
          </div>
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-xs uppercase tracking-wider text-slate-400">Bilans netto</p>
            <p className="text-2xl font-semibold text-slate-100 mt-1">{formatPLN(kpis.balance)}</p>
          </div>
        </section>

        <section className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <h2 className="text-lg font-semibold">Struktura wydatków według miesięcy</h2>
          {Object.keys(expensesByMonth).length === 0 ? (
            <p className="text-sm text-slate-400">Brak danych analitycznych. Wgraj plik CSV.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(expensesByMonth).map(([month, items]) => {
                const monthTotal = items.reduce((acc, i) => acc + Math.abs(Number(i.total)), 0);
                return (
                  <div key={month} className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-slate-200">{month}</span>
                      <span className="text-sm text-slate-400">Suma: {formatPLN(monthTotal)}</span>
                    </div>
                    <div className="space-y-2.5">
                      {items.map((item) => {
                        const absVal = Math.abs(Number(item.total));
                        const pct = monthTotal > 0 ? Math.round((absVal / monthTotal) * 100) : 0;
                        return (
                          <div key={item.category} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-300">{item.category}</span>
                              <span className="text-slate-400">
                                {formatPLN(absVal)} ({pct}%)
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: item.color }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-semibold">Historia transakcji</h2>
            <select
              value={selectedCategoryId ?? ""}
              onChange={(e) =>
                setSelectedCategoryId(e.target.value === "" ? undefined : Number(e.target.value))
              }
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-200"
            >
              <option value="">Wszystkie kategorie</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400">Ładowanie transakcji...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-2">Data</th>
                    <th className="py-3 px-2">Opis operacji</th>
                    <th className="py-3 px-2">Kategoria</th>
                    <th className="py-3 px-2 text-right">Kwota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {transactions.map((tx) => {
                    const amountNum = Number(tx.amount);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-2 whitespace-nowrap text-slate-400">
                          {tx.transaction_date}
                        </td>
                        <td className="py-3 px-2 font-medium text-slate-200">{tx.description}</td>
                        <td className="py-3 px-2">
                          <select
                            value={tx.category?.id ?? ""}
                            onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                            className="px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-slate-200"
                          >
                            <option value="">Bez kategorii</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td
                          className={`py-3 px-2 text-right font-mono whitespace-nowrap ${
                            amountNum >= 0 ? "text-emerald-400" : "text-slate-200"
                          }`}
                        >
                          {formatPLN(amountNum)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}