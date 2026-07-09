// Currency utility functions for personal-finance plugin.

import { getDb, queryGet, queryAll } from "../db.js";

export interface CurrencyRow {
  code: string;
  name: string;
  symbol: string;
  is_default: number;
}

export const PLACEHOLDER_CURRENCY = "XXX";

export function resolveCurrency(code: string | undefined, db: any = getDb()): CurrencyRow {
  if (code && code.trim()) {
    const row = queryGet(db, "SELECT code, name, symbol, is_default FROM currencies WHERE code = ?", code.trim().toUpperCase()) as CurrencyRow | undefined;
    if (!row) {
      throw new Error(`Currency "${code}" is not configured. Use manage_currency to add it first.`);
    }
    return row;
  }
  // Fall back to default currency
  const row = queryGet(db, "SELECT code, name, symbol, is_default FROM currencies WHERE is_default = 1") as CurrencyRow | undefined;
  if (!row) {
    throw new Error("No default currency configured. Use manage_currency to set one.");
  }
  return row;
}

export function isPlaceholderCurrency(db: any = getDb()): boolean {
  const row = queryGet(db, "SELECT code FROM currencies WHERE is_default = 1") as CurrencyRow | undefined;
  return row?.code === PLACEHOLDER_CURRENCY;
}

export function formatAmount(amount: number, currency: CurrencyRow, _db?: any): string {
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency.symbol}${formatted} ${currency.code}`;
}

export function getAllCurrencies(db: any = getDb()): CurrencyRow[] {
  return queryAll(db, "SELECT code, name, symbol, is_default FROM currencies ORDER BY is_default DESC, code ASC") as CurrencyRow[];
}
