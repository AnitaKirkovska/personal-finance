import type { ToolDefinition } from "@vellumai/plugin-api";
import { randomUUID } from "node:crypto";
import { getDb, queryRun, queryGet } from "../src/db.js";
import { resolveCurrency, formatAmount } from "../src/helpers/currency-utils.js";

const tool: ToolDefinition = {
  description:
    "Record a payment received and link it to an existing income entry. Use when the user tells you they actually received a payment (not just expected one). This updates the real income totals.",
  input_schema: {
    type: "object",
    properties: {
      income_id: { type: "string", description: "The ID of the income entry to link this receipt to." },
      amount: { type: "number", exclusiveMinimum: 0, description: "The actual amount received." },
      currency: { type: "string", description: "Optional currency code. Defaults to the income's currency." },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Date the payment was received." },
      notes: { type: "string", description: "Optional notes about the payment." },
    },
    required: ["income_id", "amount", "date"],
  },
  defaultRiskLevel: "low",
  execute: async (input: any) => {
    const db = getDb();

    const income = queryGet(db, "SELECT id, currency FROM incomes WHERE id = ?", input.income_id) as any;
    if (!income) {
      return { content: `Income entry not found: ${input.income_id}`, isError: true };
    }

    const currency = resolveCurrency(input.currency ?? income.currency, db);
    const id = randomUUID();

    queryRun(
      db,
      `INSERT INTO income_receipts (id, income_id, amount, currency, date, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      id, input.income_id, input.amount, currency.code, input.date, input.notes ?? null,
    );

    const formatted = formatAmount(input.amount, currency, db);
    return { content: `Payment received: ${formatted} on ${input.date} linked to income ${input.income_id} (ID: ${id})` };
  },
};

export default tool;
