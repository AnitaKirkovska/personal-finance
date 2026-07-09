// Daily sync service: generates recurring expense instances, marks overdue,
// and returns payment reminders.

import { randomUUID } from "node:crypto";

import { getDb, queryAll, queryRun } from "../db.js";
import { todayISO, addDays } from "../helpers/date-utils.js";

export interface DailySyncResult {
  expensesGenerated: number;
  expensesMarkedOverdue: number;
  remindersDue: ReminderDue[];
}

export interface ReminderDue {
  reminder_id: string;
  expense_id: string;
  description: string;
  amount: number;
  currency: string;
  due_date: string;
  days_before: number;
}

export function dailySync(db: any = getDb()): DailySyncResult {
  const today = todayISO();
  let expensesGenerated = 0;
  let expensesMarkedOverdue = 0;

  // 1. Generate recurring expense instances up to today
  const rules = queryAll(
    db,
    `SELECT id, name, amount, currency, category, frequency, interval_days,
            day_of_month, starts_on, ends_on, reminder_days_before
     FROM recurring_expense_rules
     WHERE is_active = 1`,
  ) as any[];

  for (const rule of rules) {
    const dueDates = generateDueDates(rule, today);
    for (const dueDate of dueDates) {
      // Check if expense already exists for this rule + due date
      const existing = db.prepare(
        `SELECT id FROM expenses WHERE recurring_rule_id = ? AND due_date = ?`,
      ).get(rule.id, dueDate);

      if (!existing) {
        const id = randomUUID();
        const now = new Date().toISOString();
        queryRun(
          db,
          `INSERT INTO expenses (id, amount, currency, category, description, due_date, payment_date, status, source, recurring_rule_id, generated_from_rule, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, 'PENDING', 'RECURRING', ?, 1, 1, ?, ?)`,
          id, rule.amount, rule.currency, rule.category, rule.name, dueDate, rule.id, now, now,
        );
        expensesGenerated++;

        // Create reminder if configured
        if (rule.reminder_days_before > 0) {
          const scheduledDate = addDays(dueDate, -rule.reminder_days_before);
          if (scheduledDate <= today) {
            const reminderId = randomUUID();
            try {
              queryRun(
                db,
                `INSERT OR IGNORE INTO reminders (id, expense_id, scheduled_date, days_before, sent)
                 VALUES (?, ?, ?, ?, 0)`,
                reminderId, id, scheduledDate, rule.reminder_days_before,
              );
            } catch {}
          }
        }
      }
    }
  }

  // 2. Mark overdue expenses
  const result = db.prepare(
    `UPDATE expenses SET status = 'OVERDUE', updated_at = ?
     WHERE status = 'PENDING' AND due_date < ? AND is_active = 1`,
  ).run(new Date().toISOString(), today);

  expensesMarkedOverdue = result.changes ?? 0;

  // 3. Get due reminders (unsent, scheduled for today or earlier)
  const reminders = queryAll(
    db,
    `SELECT r.id AS reminder_id, r.expense_id, r.days_before,
            e.description, e.amount, e.currency, e.due_date
     FROM reminders r
     JOIN expenses e ON r.expense_id = e.id
     WHERE r.sent = 0 AND r.scheduled_date <= ?
     ORDER BY e.due_date ASC`,
    today,
  ) as ReminderDue[];

  return {
    expensesGenerated,
    expensesMarkedOverdue,
    remindersDue: reminders,
  };
}

function generateDueDates(rule: any, upToDate: string): string[] {
  const dates: string[] = [];
  const start = rule.starts_on;
  const end = rule.ends_on ?? upToDate;
  const limit = end < upToDate ? end : upToDate;

  switch (rule.frequency) {
    case "MONTHLY": {
      const dayOfMonth = rule.day_of_month ?? new Date(start + "T00:00:00").getDate();
      let d = new Date(start + "T00:00:00");
      while (toISODate(d) <= limit) {
        const day = Math.min(dayOfMonth, daysInMonth(d.getFullYear(), d.getMonth()));
        const candidate = new Date(d.getFullYear(), d.getMonth(), day);
        if (toISODate(candidate) >= start && toISODate(candidate) <= limit) {
          dates.push(toISODate(candidate));
        }
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
      break;
    }
    case "WEEKLY": {
      let d = new Date(start + "T00:00:00");
      while (toISODate(d) <= limit) {
        if (toISODate(d) >= start) dates.push(toISODate(d));
        d.setDate(d.getDate() + 7);
      }
      break;
    }
    case "BIWEEKLY": {
      let d = new Date(start + "T00:00:00");
      while (toISODate(d) <= limit) {
        if (toISODate(d) >= start) dates.push(toISODate(d));
        d.setDate(d.getDate() + 14);
      }
      break;
    }
    case "INTERVAL_DAYS": {
      if (!rule.interval_days) break;
      let d = new Date(start + "T00:00:00");
      while (toISODate(d) <= limit) {
        if (toISODate(d) >= start) dates.push(toISODate(d));
        d.setDate(d.getDate() + rule.interval_days);
      }
      break;
    }
  }

  return dates;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
