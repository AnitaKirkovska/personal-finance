import type { ToolDefinition } from "@vellumai/plugin-api";
import { randomUUID } from "node:crypto";
import { getDb, queryRun } from "../src/db.js";
import { todayISO, nowISO } from "../src/helpers/date-utils.js";
import { resolveCurrency, formatAmount, isPlaceholderCurrency } from "../src/helpers/currency-utils.js";

const tool: ToolDefinition = {
  description:
    "Log an expense manually with amount, description, and due date. The expense is automatically marked as PAID if the due date is today or in the past, otherwise PENDING. Use when the user tells you about a purchase or bill they need to pay.",
  input_schema: {
    type: "object",
    properties: {
      amount: { type: "number", exclusiveMinimum: 0, description: "The expense amount." },
      description: { type: "string", minLength: 1, description: "What the expense is for." },
      due_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Due date in YYYY-MM-DD format." },
      category: { type: "string", description: "Optional category (e.g. Food, Rent, Transport)." },
      currency: { type: "string", description: "Optional currency code. Defaults to the configured default." },
      merchant: { type: "string", description: "Optional merchant or vendor name." },
    },
    required: ["amount", "description", "due_date"],
  },
  defaultRiskLevel: "low",
  execute: async (input: any) => {
    const db = getDb();
    const currency = resolveCurrency(input.currency, db);
    const category = input.category?.trim() || "OTHER";
    const today = todayISO();
    const isPaid = input.due_date <= today;
    const status = isPaid ? "PAID" : "PENDING";
    const paymentDate = isPaid ? input.due_date : null;
    const now = nowISO();
    const id = randomUUID();

    queryRun(
      db,
      `INSERT INTO expenses (id, amount, currency, category, merchant, description, due_date, payment_date, status, source, ocr_extraction_id, recurring_rule_id, generated_from_rule, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', NULL, NULL, 0, 1, ?, ?)`,
      id, input.amount, currency.code, category, input.merchant ?? null, input.description, input.due_date, paymentDate, status, now, now,
    );

    const formatted = formatAmount(input.amount, currency, db);
    const statusLabel = status === "PAID" ? "paid" : "pending";
    const merchantPart = input.merchant ? ` - ${input.merchant}` : "";
    let message = `Expense logged: ${formatted} - ${input.description}${merchantPart} - ${input.due_date} - ${statusLabel} (ID: ${id})`;

    if (isPlaceholderCurrency(db)) {
      message += "\n\nHint: you haven't configured a real currency yet. Use manage_currency to add yours and set it as default.";
    }

    return { content: message };
  },
};

export default tool;
