import type { ToolDefinition } from "@vellumai/plugin-api";
import { getDb, queryRun } from "../src/db.js";
import { dailySync } from "../src/services/daily-sync.js";
import { resolveCurrency, formatAmount } from "../src/helpers/currency-utils.js";
import { nowISO } from "../src/helpers/date-utils.js";

const tool: ToolDefinition = {
  description:
    "Run the daily sync: generates pending recurring expense instances, marks overdue ones, and returns payment reminders for the day. Invoke from automatic cron or when the user wants to see pending items and reminders.",
  input_schema: {
    type: "object",
    properties: {},
  },
  defaultRiskLevel: "low",
  execute: async (_input: any) => {
    const db = getDb();
    const result = dailySync(db);

    // Mark reminders as sent
    if (result.remindersDue.length > 0) {
      const stmt = db.prepare("UPDATE reminders SET sent = 1, sent_at = ? WHERE id = ?");
      const now = nowISO();
      for (const r of result.remindersDue) {
        stmt.run(now, r.reminder_id);
      }
    }

    const lines: string[] = [];
    lines.push("Daily sync completed:");
    lines.push(`  Recurring expenses generated: ${result.expensesGenerated}`);
    lines.push(`  Expenses marked as overdue: ${result.expensesMarkedOverdue}`);

    if (result.remindersDue.length === 0) {
      lines.push("  No pending reminders. Finances up to date.");
    } else {
      lines.push("", `Pending reminders (${result.remindersDue.length}):`);
      for (const r of result.remindersDue) {
        const cur = resolveCurrency(r.currency, db);
        const fmt = formatAmount(r.amount, cur, db);
        const timing = r.days_before > 0
          ? `due in ${r.days_before} day(s) (${r.due_date})`
          : `due today (${r.due_date})`;
        lines.push(`  - ${r.description}: ${fmt} - ${timing}`);
      }
    }

    return { content: lines.join("\n") };
  },
};

export default tool;
