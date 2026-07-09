import type { ToolDefinition } from "@vellumai/plugin-api";
import { randomUUID } from "node:crypto";
import { getDb, queryRun } from "../src/db.js";
import { todayISO, nowISO } from "../src/helpers/date-utils.js";
import { resolveCurrency, formatAmount, isPlaceholderCurrency } from "../src/helpers/currency-utils.js";

const tool: ToolDefinition = {
  description:
    "Log an expense from structured receipt data that the agent extracted from an image. Two-step flow: (1) first call WITHOUT confirm returns a preview and does NOT write to the database; (2) after the user confirms, call again with confirm: true and the identical fields to persist. Never set confirm: true without explicit user confirmation.",
  input_schema: {
    type: "object",
    properties: {
      amount: { type: "number", exclusiveMinimum: 0, description: "The expense amount from the receipt." },
      description: { type: "string", minLength: 1, description: "Description of the expense." },
      due_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Date of the expense in YYYY-MM-DD format." },
      category: { type: "string", description: "Optional category inferred from the receipt." },
      currency: { type: "string", description: "Optional currency code from the receipt." },
      merchant: { type: "string", description: "Optional merchant name from the receipt." },
      confirm: { type: "boolean", description: "Set to true ONLY after the user confirms the preview. First call should omit this." },
    },
    required: ["amount", "description", "due_date"],
  },
  defaultRiskLevel: "low",
  execute: async (input: any) => {
    const db = getDb();
    const currency = resolveCurrency(input.currency, db);
    const formatted = formatAmount(input.amount, currency, db);

    // Step 1: preview without confirm
    if (!input.confirm) {
      const lines = [
        "Receipt expense preview (not saved yet):",
        `  Amount: ${formatted}`,
        `  Description: ${input.description}`,
        `  Date: ${input.due_date}`,
      ];
      if (input.category) lines.push(`  Category: ${input.category}`);
      if (input.merchant) lines.push(`  Merchant: ${input.merchant}`);
      lines.push("");
      lines.push("If this looks correct, ask the user to confirm. Then call this tool again with confirm: true and the same fields.");
      return { content: lines.join("\n") };
    }

    // Step 2: persist with confirm
    const category = input.category?.trim() || "OTHER";
    const today = todayISO();
    const isPaid = input.due_date <= today;
    const status = isPaid ? "PAID" : "PENDING";
    const paymentDate = isPaid ? input.due_date : null;
    const now = nowISO();
    const id = randomUUID();

    // Create the OCR extraction record
    const ocrId = randomUUID();
    queryRun(
      db,
      `INSERT INTO ocr_extractions (id, provider, suggested_amount, suggested_currency, suggested_date, suggested_merchant, suggested_category, status, created_at)
       VALUES (?, 'agentic', ?, ?, ?, ?, ?, 'COMPLETED', ?)`,
      ocrId, input.amount, currency.code, input.due_date, input.merchant ?? null, category, now,
    );

    queryRun(
      db,
      `INSERT INTO expenses (id, amount, currency, category, merchant, description, due_date, payment_date, status, source, ocr_extraction_id, recurring_rule_id, generated_from_rule, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIPT', ?, NULL, 0, 1, ?, ?)`,
      id, input.amount, currency.code, category, input.merchant ?? null, input.description, input.due_date, paymentDate, status, ocrId, now, now,
    );

    const statusLabel = status === "PAID" ? "paid" : "pending";
    const merchantPart = input.merchant ? ` - ${input.merchant}` : "";
    let message = `Expense logged from receipt: ${formatted} - ${input.description}${merchantPart} - ${input.due_date} - ${statusLabel} (ID: ${id})`;

    if (isPlaceholderCurrency(db)) {
      message += "\n\nHint: you haven't configured a real currency yet. Use manage_currency to add yours and set it as default.";
    }

    return { content: message };
  },
};

export default tool;
