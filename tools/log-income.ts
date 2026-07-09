import type { ToolDefinition } from "@vellumai/plugin-api";
import { randomUUID } from "node:crypto";
import { getDb, queryRun } from "../src/db.js";
import { resolveCurrency, formatAmount } from "../src/helpers/currency-utils.js";

const tool: ToolDefinition = {
  description:
    "Log an income entry with expected amount, reason, and date. Can be one-time or recurring. Use when the user tells you about money they expect to receive or have received (salary, freelance, etc).",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", minLength: 1, description: "What the income is for (e.g. 'Salary', 'Freelance project')." },
      expected_amount: { type: "number", exclusiveMinimum: 0, description: "The expected income amount." },
      currency: { type: "string", description: "Optional currency code. Defaults to the configured default." },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Expected date in YYYY-MM-DD format." },
      is_recurring: { type: "boolean", description: "Whether this is recurring income. Default false." },
      frequency: { type: "string", enum: ["MONTHLY", "WEEKLY", "BIWEEKLY", "INTERVAL_DAYS"], description: "Frequency if recurring." },
      interval_days: { type: "number", description: "Interval in days if frequency is INTERVAL_DAYS." },
    },
    required: ["reason", "expected_amount", "date"],
  },
  defaultRiskLevel: "low",
  execute: async (input: any) => {
    const db = getDb();
    const currency = resolveCurrency(input.currency, db);
    const id = randomUUID();

    queryRun(
      db,
      `INSERT INTO incomes (id, reason, expected_amount, currency, date, frequency, interval_days, is_recurring, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      id, input.reason, input.expected_amount, currency.code, input.date,
      input.frequency ?? null, input.interval_days ?? null, input.is_recurring ? 1 : 0,
    );

    const formatted = formatAmount(input.expected_amount, currency, db);
    const recurringLabel = input.is_recurring ? ` (recurring, ${input.frequency})` : "";
    return { content: `Income logged: ${formatted} - ${input.reason} - ${input.date}${recurringLabel} (ID: ${id})` };
  },
};

export default tool;
