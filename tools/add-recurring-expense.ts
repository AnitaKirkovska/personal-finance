import type { ToolDefinition } from "@vellumai/plugin-api";
import { randomUUID } from "node:crypto";
import { getDb, queryRun } from "../src/db.js";
import { resolveCurrency, formatAmount } from "../src/helpers/currency-utils.js";

const tool: ToolDefinition = {
  description:
    "Create a recurring expense rule (e.g. rent, subscription, loan payment). The daily sync will automatically generate expense instances based on the frequency. Use when the user mentions a bill that repeats.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, description: "Name of the recurring expense (e.g. 'Rent', 'Netflix')." },
      amount: { type: "number", exclusiveMinimum: 0, description: "The recurring amount." },
      currency: { type: "string", description: "Optional currency code. Defaults to the configured default." },
      category: { type: "string", description: "Optional category." },
      frequency: { type: "string", enum: ["MONTHLY", "WEEKLY", "BIWEEKLY", "INTERVAL_DAYS"], description: "How often the expense recurs." },
      interval_days: { type: "number", description: "Days between occurrences if frequency is INTERVAL_DAYS." },
      day_of_month: { type: "number", description: "Day of month for MONTHLY frequency (1-31). Optional, defaults to starts_on day." },
      starts_on: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "When the recurring rule starts (YYYY-MM-DD)." },
      ends_on: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Optional end date for the recurring rule." },
      reminder_days_before: { type: "number", description: "Days before due date to send a reminder. Default 0 (no reminder)." },
    },
    required: ["name", "amount", "frequency", "starts_on"],
  },
  defaultRiskLevel: "low",
  execute: async (input: any) => {
    const db = getDb();
    const currency = resolveCurrency(input.currency, db);
    const id = randomUUID();

    queryRun(
      db,
      `INSERT INTO recurring_expense_rules (id, name, amount, category, currency, frequency, interval_days, day_of_month, starts_on, ends_on, reminder_days_before, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      id, input.name, input.amount, input.category ?? null, currency.code, input.frequency,
      input.interval_days ?? null, input.day_of_month ?? null, input.starts_on, input.ends_on ?? null,
      input.reminder_days_before ?? 0,
    );

    const formatted = formatAmount(input.amount, currency, db);
    return { content: `Recurring expense created: ${input.name} - ${formatted} (${input.frequency}) starting ${input.starts_on} (ID: ${id})` };
  },
};

export default tool;
