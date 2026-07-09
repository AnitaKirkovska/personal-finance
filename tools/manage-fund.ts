import type { ToolDefinition } from "@vellumai/plugin-api";
import { randomUUID } from "node:crypto";
import { getDb, queryAll, queryRun, queryGet } from "../src/db.js";
import { resolveCurrency, formatAmount, isPlaceholderCurrency, PLACEHOLDER_CURRENCY } from "../src/helpers/currency-utils.js";
import { todayISO } from "../src/helpers/date-utils.js";

const tool: ToolDefinition = {
  description:
    "Create, list, deposit into, withdraw from, or archive financial containers such as savings funds and bank accounts. Use when the user wants to manage their savings goals or track account balances.",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "list", "deposit", "withdraw", "archive"],
        description: "What to do with the fund.",
      },
      fund: { type: "string", description: "Fund ID or name (case-insensitive). Required for deposit, withdraw, archive." },
      name: { type: "string", description: "Name for the fund. Required for create." },
      type: { type: "string", enum: ["savings", "account"], description: "Fund type. Required for create." },
      currency: { type: "string", description: "Currency code. Required for create." },
      initial_balance: { type: "number", description: "Starting balance for create. Default 0." },
      contribution_amount: { type: "number", description: "Optional regular contribution amount." },
      contribution_frequency: { type: "string", description: "Optional contribution frequency." },
      contribution_required: { type: "boolean", description: "Whether contributions are mandatory for plan_allocation. Default false." },
      target_amount: { type: "number", description: "Optional savings target amount." },
      target_date: { type: "string", description: "Optional target date (YYYY-MM-DD)." },
      amount: { type: "number", description: "Amount for deposit or withdraw." },
      date: { type: "string", description: "Date for deposit or withdraw. Defaults to today." },
      notes: { type: "string", description: "Optional notes for deposit or withdraw." },
    },
    required: ["action"],
  },
  defaultRiskLevel: "low",
  execute: async (input: any) => {
    const db = getDb();

    switch (input.action) {
      case "create": {
        if (!input.name || !input.type || !input.currency) {
          return { content: "Missing required fields for create: name, type, and currency are required.", isError: true };
        }
        const currency = resolveCurrency(input.currency, db);
        const id = randomUUID();
        queryRun(
          db,
          `INSERT INTO funds (id, name, type, currency, initial_balance, contribution_amount, contribution_frequency, contribution_required, contribution_starts_on, target_amount, target_date, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
          id, input.name, input.type, currency.code, input.initial_balance ?? 0,
          input.contribution_amount ?? null, input.contribution_frequency ?? null,
          input.contribution_required ? 1 : 0, input.date ?? null,
          input.target_amount ?? null, input.target_date ?? null,
        );
        const fmt = formatAmount(input.initial_balance ?? 0, currency, db);
        return { content: `Fund created: ${input.name} (${input.type}) - ${fmt} (ID: ${id})` };
      }

      case "list": {
        const funds = queryAll(db, "SELECT * FROM funds WHERE is_active = 1 ORDER BY created_at DESC") as any[];
        if (!funds.length) return { content: "No funds configured." };

        const lines: string[] = [`Funds (${funds.length}):`];
        for (const f of funds) {
          const cur = resolveCurrency(f.currency, db);
          const fmt = (amt: number) => formatAmount(amt, cur, db);

          // Calculate balance
          const deposits = queryGet(db, "SELECT COALESCE(SUM(amount), 0) AS total FROM fund_transactions WHERE fund_id = ? AND type = 'deposit'", f.id) as any;
          const withdrawals = queryGet(db, "SELECT COALESCE(SUM(amount), 0) AS total FROM fund_transactions WHERE fund_id = ? AND type = 'withdrawal'", f.id) as any;
          const balance = f.initial_balance + (deposits?.total ?? 0) - (withdrawals?.total ?? 0);

          lines.push(`  ${f.name} [${f.type}] Balance: ${fmt(balance)}`);
          if (f.target_amount) {
            const progress = Math.round((balance / f.target_amount) * 100);
            const dateSuffix = f.target_date ? ` before ${f.target_date}` : "";
            lines.push(`    Target: ${fmt(f.target_amount)}${dateSuffix} (${progress}%)`);
          }
        }

        if (isPlaceholderCurrency(db)) {
          lines.push("", `Hint: configure a real currency with manage_currency.`);
        }
        return { content: lines.join("\n") };
      }

      case "deposit":
      case "withdraw": {
        if (!input.fund || !input.amount) {
          return { content: `Missing required fields for ${input.action}: fund and amount.`, isError: true };
        }
        const fund = resolveFund(input.fund, db);
        if (!fund) return { content: `Fund not found: ${input.fund}`, isError: true };
        if (!fund.is_active) return { content: `Fund ${fund.name} is archived.`, isError: true };

        const txType = input.action === "deposit" ? "deposit" : "withdrawal";
        const id = randomUUID();
        const date = input.date ?? todayISO();
        queryRun(
          db,
          `INSERT INTO fund_transactions (id, fund_id, type, amount, date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          id, fund.id, txType, input.amount, date, input.notes ?? null,
        );

        // Recalculate balance
        const deposits = queryGet(db, "SELECT COALESCE(SUM(amount), 0) AS total FROM fund_transactions WHERE fund_id = ? AND type = 'deposit'", fund.id) as any;
        const withdrawals = queryGet(db, "SELECT COALESCE(SUM(amount), 0) AS total FROM fund_transactions WHERE fund_id = ? AND type = 'withdrawal'", fund.id) as any;
        const balance = fund.initial_balance + (deposits?.total ?? 0) - (withdrawals?.total ?? 0);

        const cur = resolveCurrency(fund.currency, db);
        const fmt = formatAmount(balance, cur, db);
        return { content: `${input.action === "deposit" ? "Deposited" : "Withdrew"} ${formatAmount(input.amount, cur, db)} from ${fund.name}. New balance: ${fmt} (ID: ${id})` };
      }

      case "archive": {
        if (!input.fund) return { content: "Missing required field: fund.", isError: true };
        const fund = resolveFund(input.fund, db);
        if (!fund) return { content: `Fund not found: ${input.fund}`, isError: true };
        queryRun(db, "UPDATE funds SET is_active = 0 WHERE id = ?", fund.id);
        return { content: `Fund archived: ${fund.name}` };
      }

      default:
        return { content: `Unknown action: ${input.action}`, isError: true };
    }
  },
};

function resolveFund(idOrName: string, db: any): any {
  // Try by ID first
  const byId = queryGet(db, "SELECT * FROM funds WHERE id = ?", idOrName) as any;
  if (byId) return byId;
  // Try by name (case-insensitive)
  const byName = queryGet(db, "SELECT * FROM funds WHERE LOWER(name) = LOWER(?)", idOrName) as any;
  return byName;
}

export default tool;
