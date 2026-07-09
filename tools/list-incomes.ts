import type { ToolDefinition } from "@vellumai/plugin-api";
import { getDb, queryAll } from "../src/db.js";
import { formatAmount, type CurrencyRow } from "../src/helpers/currency-utils.js";

const tool: ToolDefinition = {
  description:
    "List income entries and optionally their received payments. Use when the user wants to see their income sources, check what payments came in, or review earnings.",
  input_schema: {
    type: "object",
    properties: {
      period: { type: "string", enum: ["this_month", "last_month", "last_30_days", "this_year"], description: "Optional period filter for income receipts." },
      currency: { type: "string", description: "Optional currency code filter." },
      include_receipts: { type: "boolean", description: "Whether to include received payment details. Default false." },
    },
  },
  defaultRiskLevel: "low",
  execute: async (input: any) => {
    const db = getDb();
    let sql = `SELECT id, reason, expected_amount, currency, date, frequency, is_recurring, is_active
               FROM incomes WHERE is_active = 1`;
    const params: any[] = [];

    if (input.currency) { sql += ` AND currency = ?`; params.push(input.currency.toUpperCase()); }
    sql += ` ORDER BY date DESC`;

    const incomes = queryAll(db, sql, ...params) as any[];
    if (!incomes.length) return { content: "No income entries found." };

    const curCache = new Map<string, CurrencyRow>();
    const lines: string[] = [`Income entries (${incomes.length}):`];

    for (const inc of incomes) {
      if (!curCache.has(inc.currency)) {
        const cur = db.prepare("SELECT code, name, symbol, is_default FROM currencies WHERE code = ?").get(inc.currency) as CurrencyRow | undefined;
        if (cur) curCache.set(inc.currency, cur);
      }
      const cur = curCache.get(inc.currency);
      const fmt = (amt: number) => cur ? formatAmount(amt, cur, db) : `${amt} ${inc.currency}`;
      const recurring = inc.is_recurring ? ` (recurring, ${inc.frequency})` : "";
      lines.push(`  ${inc.date} ${fmt(inc.expected_amount)} ${inc.reason}${recurring} (ID: ${inc.id})`);

      if (input.include_receipts) {
        const receipts = queryAll(
          db,
          `SELECT id, amount, currency, date, notes FROM income_receipts WHERE income_id = ? ORDER BY date DESC`,
          inc.id,
        ) as any[];
        if (receipts.length > 0) {
          const total = receipts.reduce((s, r) => s + r.amount, 0);
          lines.push(`    Received: ${fmt(total)} (${receipts.length} payments)`);
          for (const r of receipts) {
            lines.push(`      ${r.date} ${fmt(r.amount)}${r.notes ? ` - ${r.notes}` : ""}`);
          }
        }
      }
    }

    return { content: lines.join("\n") };
  },
};

export default tool;
