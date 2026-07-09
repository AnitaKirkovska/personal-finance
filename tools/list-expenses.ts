import type { ToolDefinition } from "@vellumai/plugin-api";
import { getDb, queryAll } from "../src/db.js";
import { formatAmount, type CurrencyRow } from "../src/helpers/currency-utils.js";

const tool: ToolDefinition = {
  description:
    "List expenses with filters by period, status, category, or search term. Use when the user wants to see their expenses, find a specific charge, or browse by category.",
  input_schema: {
    type: "object",
    properties: {
      period: { type: "string", enum: ["this_month", "last_month", "last_30_days", "this_year"], description: "Optional period filter." },
      status: { type: "string", enum: ["PAID", "PENDING", "OVERDUE"], description: "Optional status filter." },
      category: { type: "string", description: "Optional category filter (case-insensitive)." },
      search: { type: "string", description: "Optional search term for description or merchant." },
      currency: { type: "string", description: "Optional currency code filter." },
      limit: { type: "number", description: "Max results. Default 50." },
    },
  },
  defaultRiskLevel: "low",
  execute: async (input: any) => {
    const db = getDb();
    let sql = `SELECT id, amount, currency, category, merchant, description, due_date, payment_date, status, source
               FROM expenses WHERE is_active = 1`;
    const params: any[] = [];

    if (input.period) {
      const { resolvePeriodRange } = await import("../src/helpers/date-utils.js");
      const range = resolvePeriodRange(input.period);
      if (range) {
        sql += ` AND due_date BETWEEN ? AND ?`;
        params.push(range.start, range.end);
      }
    }
    if (input.status) { sql += ` AND status = ?`; params.push(input.status); }
    if (input.category) { sql += ` AND LOWER(category) = LOWER(?)`; params.push(input.category); }
    if (input.currency) { sql += ` AND currency = ?`; params.push(input.currency.toUpperCase()); }
    if (input.search) { sql += ` AND (LOWER(description) LIKE LOWER(?) OR LOWER(merchant) LIKE LOWER(?))`; params.push(`%${input.search}%`, `%${input.search}%`); }

    sql += ` ORDER BY due_date DESC LIMIT ?`;
    params.push(input.limit ?? 50);

    const rows = queryAll(db, sql, ...params) as any[];
    if (!rows.length) return { content: "No expenses found matching the filters." };

    // Cache currencies for formatting
    const curCache = new Map<string, CurrencyRow>();
    const lines: string[] = [`Expenses (${rows.length}):`];
    for (const r of rows) {
      if (!curCache.has(r.currency)) {
        const cur = db.prepare("SELECT code, name, symbol, is_default FROM currencies WHERE code = ?").get(r.currency) as CurrencyRow | undefined;
        if (cur) curCache.set(r.currency, cur);
      }
      const cur = curCache.get(r.currency);
      const amt = cur ? formatAmount(r.amount, cur, db) : `${r.amount} ${r.currency}`;
      const merchant = r.merchant ? ` - ${r.merchant}` : "";
      lines.push(`  ${r.due_date} ${amt} ${r.description}${merchant} [${r.status}] (ID: ${r.id})`);
    }

    return { content: lines.join("\n") };
  },
};

export default tool;
