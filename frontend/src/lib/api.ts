import type { components } from "./api-types";

export type Transaction = components["schemas"]["TransactionOut"];
export type Category = components["schemas"]["CategoryOut"];
export type ImportSummary = components["schemas"]["ImportSummary"];
export type MonthlyCategoryStat = components["schemas"]["MonthlyCategoryStat"];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function fetchTransactions(categoryId?: number): Promise<Transaction[]> {
  const url = new URL(`${API_URL}/api/transactions`);
  if (categoryId !== undefined) {
    url.searchParams.set("category_id", String(categoryId));
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error("Nie udało się pobrać transakcji");
  return res.json();
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${API_URL}/api/categories`, { cache: "no-store" });
  if (!res.ok) throw new Error("Nie udało się pobrać kategorii");
  return res.json();
}

export async function fetchMonthlyAnalytics(): Promise<MonthlyCategoryStat[]> {
  const res = await fetch(`${API_URL}/api/analytics/monthly`, { cache: "no-store" });
  if (!res.ok) throw new Error("Nie udało się pobrać analityki");
  return res.json();
}

export async function uploadCsvStatement(file: File): Promise<ImportSummary> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/api/transactions/import`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Błąd importu pliku CSV" }));
    throw new Error(err.detail || "Błąd importu pliku CSV");
  }
  return res.json();
}

export async function updateTransactionCategory(
  transactionId: number,
  categoryId: number | null
): Promise<Transaction> {
  const res = await fetch(`${API_URL}/api/transactions/${transactionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category_id: categoryId }),
  });
  if (!res.ok) throw new Error("Nie udało się zaktualizować kategorii");
  return res.json();
}