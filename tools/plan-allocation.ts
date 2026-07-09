import type { ToolDefinition } from "@vellumai/plugin-api";
import { getDb, queryAll } from "../src/db.js";
import { resolveCurrency, formatAmount, type CurrencyRow } from "../src/helpers/currency-utils.js";
import { todayISO, resolvePeriodRange } from "../src/helpers/date-utils.js";

const tool: ToolDefinition = {
  description:
    "Given an income amount, show current-month commitments (recurring + manual pending expenses) and remaining balance by currency. Use when the user receives a payment and wants to know how to allocate it. Operates per currency: call once per currency if the user has income in multiple currencies.",
  input_schema: {
    type: "object",
    properties: {
      amount: { type: "number", exclusiveMinimum: 0, description: "The income amount to allocate." },
      currency: { type: "string", description: "Currency code for this income. Defaults to the configured default." },
    },
    required: ["amount"],
  },
  defaultRiskLevel: "low",
  execute: async (input: any) => {
    const db = getDb();
    const currency = resolveCurrency(input.currency, db);
    const fmt = (amt: number) => formatAmount(amt, currency, db);
    const today = todayISO();

    // Pending manual expenses this month
    const range = resolvePeriodRange("this_month")!;
    const pendingExpenses = queryAll(
      db,
      `SELECT description, amount, due_date, status FROM expenses
       WHERE currency = ? AND due_date BETWEEN ? AND ? AND is_active = 1
       AND status IN ('PENDING', 'OVERDUE')
       AND recurring_rule_id IS NULL
       ORDER BY due_date ASC`,
      currency.code, range.start, range.end,
    ) as any[];

    // Unsynced recurring rules (no expense generated for this period)
    const unsyncedRules = queryAll(
      db,
      `SELECT r.id, r.name, r.amount, r.frequency, r.interval_days, r.starts_on
       FROM recurring_expense_rules r
       WHERE r.is_active = 1 AND r.currency = ?
       AND NOT EXISTS (
         SELECT 1 FROM expenses e
         WHERE e.recurring_rule_id = r.id
         AND e.due_date BETWEEN ? AND ?
       )`,
      currency.code, range.start, range.end,
    ) as any[];

    // Savings funds with required contributions
    const requiredFunds = queryAll(
      db,
      `SELECT name, contribution_amount, target_amount, initial_balance
       FROM funds WHERE is_active = 1 AND currency = ? AND contribution_required = 1
       AND contribution_amount IS NOT NULL`,
      currency.code,
    ) as any[];

    // Savings funds with optional contributions
    const optionalFunds = queryAll(
      db,
      `SELECT name, contribution_amount, target_amount, initial_balance
       FROM funds WHERE is_active = 1 AND currency = ? AND contribution_required = 0
       AND contribution_amount IS NOT NULL`,
      currency.code,
    ) as any[];

    // Calculate totals
    const pendingTotal = pendingExpenses.reduce((s, e) => s + e.amount, 0);
    const recurringTotal = unsyncedRules.reduce((s, r) => s + r.amount, 0);
    const requiredSavingsTotal = requiredFunds.reduce((s, f) => s + (f.contribution_amount ?? 0), 0);
    const totalCommitments = pendingTotal + recurringTotal + requiredSavingsTotal;
    const remaining = input.amount - totalCommitments;

    const lines: string[] = [];
    lines.push(`Allocation plan for ${fmt(input.amount)}`);
    lines.push("");

    if (pendingExpenses.length > 0) {
      lines.push("Pending expenses this month:");
      for (const e of pendingExpenses) {
        const statusTag = e.status === "OVERDUE" ? " [OVERDUE]" : "";
        lines.push(`  ${e.due_date} ${fmt(e.amount)} ${e.description}${statusTag}`);
      }
      lines.push(`  Subtotal: ${fmt(pendingTotal)}`);
      lines.push("");
    }

    if (unsyncedRules.length > 0) {
      lines.push("Recurring commitments (not yet synced):");
      for (const r of unsyncedRules) {
        lines.push(`  ${r.name} ${fmt(r.amount)} (${r.frequency})`);
      }
      lines.push(`  Subtotal: ${fmt(recurringTotal)}`);
      lines.push("");
    }

    if (requiredFunds.length > 0) {
      lines.push("Required savings contributions:");
      for (const f of requiredFunds) {
        lines.push(`  ${f.name} ${fmt(f.contribution_amount)}`);
      }
      lines.push(`  Subtotal: ${fmt(requiredSavingsTotal)}`);
      lines.push("");
    }

    lines.push(`Total commitments: ${fmt(totalCommitments)}`);
    lines.push(`Remaining after commitments: ${fmt(remaining)}`);

    if (optionalFunds.length > 0) {
      lines.push("", "Suggested savings (optional):");
      for (const f of optionalFunds) {
        // Calculate current balance
        const deposits = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM fund_transactions WHERE fund_id IN (SELECT id FROM funds WHERE name = ?) AND type = 'deposit'").get(f.name) as any;
        const withdrawals = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM fund_transactions WHERE fund_id IN (SELECT id FROM funds WHERE name = ?) AND type = 'withdrawal'").get(f.name) as any;
        const balance = f.initial_balance + (deposits?.total ?? 0) - (withdrawals?.total ?? 0);
        const progress = f.target_amount ? ` (target: ${fmt(f.target_amount)}, ${Math.round((balance / f.target_amount) * 100)}%)` : "";
        lines.push(`  ${f.name} ${fmt(f.contribution_amount)} suggested - balance: ${fmt(balance)}${progress}`);
      }
    }

    if (remaining < 0) {
      lines.push("", `Warning: you are ${fmt(Math.abs(remaining))} short. Consider reducing optional expenses or savings.`);
    }

    return { content: lines.join("\n") };
  },
};

export default tool;
