import type { ToolDefinition } from "@vellumai/plugin-api";
import { getDb, queryAll } from "../src/db.js";
import { resolvePeriodRange, type SupportedPeriod } from "../src/helpers/date-utils.js";
import { formatAmount, type CurrencyRow } from "../src/helpers/currency-utils.js";

const PERIOD_LABELS: Record<string, string> = {
  this_month: "this month",
  last_month: "last month",
  last_30_days: "last 30 days",
  this_year: "this year",
};

function monthlyEquivalent(amount: number, frequency: string, intervalDays: number | null): number {
  switch (frequency) {
    case "MONTHLY": return amount;
    case "WEEKLY": return Math.round(amount * 4.33);
    case "BIWEEKLY": return Math.round(amount * 2.17);
    case "INTERVAL_DAYS": return intervalDays ? Math.round((amount * 30) / intervalDays) : amount;
    default: return amount;
  }
}

const tool: ToolDefinition = {
  description:
    "Get a financial summary for a period: total income received, total expenses, pending expenses, balance, breakdown by category, and active recurring commitments. Use when the user asks about their spending, budget, or financial overview.",
  input_schema: {
    type: "object",
    properties: {
      period: {
        type: "string",
        enum: ["this_month", "last_month", "last_30_days", "this_year"],
        description: "The period to summarize. Defaults to this_month.",
      },
      currency: { type: "string", description: "Optional currency code to filter by." },
    },
  },
  defaultRiskLevel: "low",
  execute: async (input: any) => {
    const db = getDb();
    const period = (input.period ?? "this_month") as SupportedPeriod;
    const range = resolvePeriodRange(period);
    if (!range) return { content: "Period 'all' is not supported.", isError: true };

    const filter = input.currency?.trim() || null;

    const expenseByCat = queryAll(
      db,
      `SELECT currency, category, SUM(amount) AS total FROM expenses
       WHERE due_date BETWEEN ? AND ? AND is_active = 1 AND (? IS NULL OR currency = ?)
       GROUP BY currency, category`,
      range.start, range.end, filter, filter,
    ) as any[];

    const pendingByCurrency = queryAll(
      db,
      `SELECT currency, SUM(amount) AS total FROM expenses
       WHERE status = 'PENDING' AND due_date BETWEEN ? AND ? AND is_active = 1 AND (? IS NULL OR currency = ?)
       GROUP BY currency`,
      range.start, range.end, filter, filter,
    ) as any[];

    const incomeByCurrency = queryAll(
      db,
      `SELECT currency, SUM(amount) AS total FROM income_receipts
       WHERE date BETWEEN ? AND ? AND (? IS NULL OR currency = ?)
       GROUP BY currency`,
      range.start, range.end, filter, filter,
    ) as any[];

    const rules = queryAll(
      db,
      `SELECT name, amount, currency, frequency, interval_days FROM recurring_expense_rules
       WHERE is_active = 1 AND (? IS NULL OR currency = ?)`,
      filter, filter,
    ) as any[];

    const allCurrencies = new Set<string>();
    expenseByCat.forEach((r) => allCurrencies.add(r.currency));
    pendingByCurrency.forEach((r) => allCurrencies.add(r.currency));
    incomeByCurrency.forEach((r) => allCurrencies.add(r.currency));
    rules.forEach((r) => allCurrencies.add(r.currency));
    if (filter) allCurrencies.add(filter);

    const lines: string[] = [`Period: ${PERIOD_LABELS[period]} (${range.start} to ${range.end})`, ""];

    if (allCurrencies.size === 0) {
      lines.push("No transactions recorded in this period.");
      lines.push("", "Active recurring commitments: 0");
      return { content: lines.join("\n") };
    }

    for (const code of [...allCurrencies].sort()) {
      const curRow = db.prepare("SELECT code, name, symbol, is_default FROM currencies WHERE code = ?").get(code) as CurrencyRow | undefined;
      if (!curRow) continue;
      const fmt = (amt: number) => formatAmount(amt, curRow, db);

      const catRows = expenseByCat.filter((r) => r.currency === code);
      const totalExpenses = catRows.reduce((s, r) => s + r.total, 0);
      const totalPending = pendingByCurrency.find((r) => r.currency === code)?.total ?? 0;
      const totalIncome = incomeByCurrency.find((r) => r.currency === code)?.total ?? 0;
      const balance = totalIncome - totalExpenses;

      lines.push(code);
      lines.push(`Income received: ${fmt(totalIncome)}`);
      lines.push(`Total expenses: ${fmt(totalExpenses)}`);
      lines.push(`Pending expenses: ${fmt(totalPending)}`);
      lines.push(`Received balance: ${fmt(balance)}`);

      if (catRows.length > 0) {
        lines.push("", "By category:");
        for (const cat of [...catRows].sort((a, b) => b.total - a.total)) {
          lines.push(`  ${cat.category ?? "UNCATEGORIZED"} ${fmt(cat.total)}`);
        }
      }

      const curRules = rules.filter((r) => r.currency === code);
      if (curRules.length > 0) {
        const totalMonthly = curRules.reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency, r.interval_days), 0);
        lines.push("", `Active recurring commitments: ${curRules.length} (${fmt(totalMonthly)}/mo)`);
        for (const rule of curRules) {
          lines.push(`  ${rule.name} ${fmt(rule.amount)} (${rule.frequency})`);
        }
      }

      lines.push("");
    }

    if (rules.length === 0) lines.push("Active recurring commitments: 0");

    return { content: lines.join("\n").trimEnd() };
  },
};

export default tool;
