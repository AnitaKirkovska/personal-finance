import type { ToolDefinition } from "@vellumai/plugin-api";
import { getDb, queryRun, queryGet } from "../src/db.js";
import { todayISO } from "../src/helpers/date-utils.js";
import { resolveCurrency, formatAmount } from "../src/helpers/currency-utils.js";

const tool: ToolDefinition = {
  description:
    "Mark an existing expense as paid. Use when the user tells you they paid a bill or expense that was previously pending or overdue.",
  input_schema: {
    type: "object",
    properties: {
      expense_id: { type: "string", description: "The ID of the expense to mark as paid." },
      payment_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Optional payment date. Defaults to today." },
    },
    required: ["expense_id"],
  },
  defaultRiskLevel: "low",
  execute: async (input: any) => {
    const db = getDb();
    const expense = queryGet(db, "SELECT id, amount, currency, description, status FROM expenses WHERE id = ? AND is_active = 1", input.expense_id) as any;
    if (!expense) {
      return { content: `Expense not found: ${input.expense_id}`, isError: true };
    }
    if (expense.status === "PAID") {
      return { content: `Expense ${input.expense_id} is already marked as paid.` };
    }

    const paymentDate = input.payment_date ?? todayISO();
    queryRun(db, "UPDATE expenses SET status = 'PAID', payment_date = ?, updated_at = datetime('now') WHERE id = ?", paymentDate, input.expense_id);

    const currency = resolveCurrency(expense.currency, db);
    const formatted = formatAmount(expense.amount, currency, db);
    return { content: `Expense marked as paid: ${formatted} - ${expense.description} on ${paymentDate} (ID: ${input.expense_id})` };
  },
};

export default tool;
