// Database schema definitions for personal-finance plugin.
// All tables use CREATE TABLE IF NOT EXISTS for idempotent init.

export const CREATE_CURRENCIES_TABLE = `
CREATE TABLE IF NOT EXISTS currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const CREATE_OCR_EXTRACTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS ocr_extractions (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'agentic',
  source_path TEXT,
  raw_text TEXT,
  lines_json TEXT,
  average_confidence REAL,
  suggested_amount REAL,
  suggested_currency TEXT,
  suggested_date TEXT,
  suggested_merchant TEXT,
  suggested_category TEXT,
  failure_reason TEXT,
  failure_detail TEXT,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  failure_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const CREATE_RECURRING_EXPENSE_RULES_TABLE = `
CREATE TABLE IF NOT EXISTS recurring_expense_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT,
  currency TEXT NOT NULL,
  frequency TEXT NOT NULL,
  interval_days INTEGER,
  day_of_month INTEGER,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  reminder_days_before INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (currency) REFERENCES currencies (code)
);
`;

export const CREATE_EXPENSES_TABLE = `
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  category TEXT,
  merchant TEXT,
  description TEXT NOT NULL,
  due_date TEXT NOT NULL,
  payment_date TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  ocr_extraction_id TEXT,
  recurring_rule_id TEXT,
  generated_from_rule INTEGER NOT NULL DEFAULT 0 CHECK (generated_from_rule IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (currency) REFERENCES currencies (code),
  FOREIGN KEY (ocr_extraction_id) REFERENCES ocr_extractions (id),
  FOREIGN KEY (recurring_rule_id) REFERENCES recurring_expense_rules (id)
);
`;

export const CREATE_EXPENSES_RECURRING_UNIQUE_INDEX = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_recurring_rule_due_date
ON expenses (recurring_rule_id, due_date)
WHERE recurring_rule_id IS NOT NULL;
`;

export const CREATE_INCOMES_TABLE = `
CREATE TABLE IF NOT EXISTS incomes (
  id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  expected_amount REAL NOT NULL,
  currency TEXT NOT NULL,
  date TEXT NOT NULL,
  frequency TEXT,
  interval_days INTEGER,
  is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0, 1)),
  next_expected_receipt_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (currency) REFERENCES currencies (code)
);
`;

export const CREATE_INCOME_RECEIPTS_TABLE = `
CREATE TABLE IF NOT EXISTS income_receipts (
  id TEXT PRIMARY KEY,
  income_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (income_id) REFERENCES incomes (id),
  FOREIGN KEY (currency) REFERENCES currencies (code)
);
`;

export const CREATE_REMINDERS_TABLE = `
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  days_before INTEGER NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0 CHECK (sent IN (0, 1)),
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (expense_id) REFERENCES expenses (id)
);
`;

export const CREATE_REMINDERS_UNIQUE_INDEX = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_expense_schedule_days_before
ON reminders (expense_id, scheduled_date, days_before);
`;

export const CREATE_FUNDS_TABLE = `
CREATE TABLE IF NOT EXISTS funds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('savings', 'account')),
  currency TEXT NOT NULL,
  initial_balance REAL NOT NULL DEFAULT 0,
  contribution_amount REAL,
  contribution_frequency TEXT,
  contribution_interval_days INTEGER,
  contribution_required INTEGER NOT NULL DEFAULT 0 CHECK (contribution_required IN (0, 1)),
  contribution_starts_on TEXT,
  target_amount REAL,
  target_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (currency) REFERENCES currencies (code)
);
`;

export const CREATE_FUND_TRANSACTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS fund_transactions (
  id TEXT PRIMARY KEY,
  fund_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount REAL NOT NULL CHECK (amount > 0),
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (fund_id) REFERENCES funds (id)
);
`;

export const SEED_PLACEHOLDER_CURRENCY = `
INSERT OR IGNORE INTO currencies (code, name, symbol, is_default)
VALUES ('XXX', 'Not configured', '¤', 1);
`;

export const CREATE_PLAID_ITEMS_TABLE = `
CREATE TABLE IF NOT EXISTS plaid_items (
  item_id TEXT PRIMARY KEY,
  credential_key TEXT NOT NULL,
  cursor TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ERROR', 'DEAUTHORIZED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const ALL_MIGRATIONS = [
  CREATE_CURRENCIES_TABLE,
  CREATE_OCR_EXTRACTIONS_TABLE,
  CREATE_RECURRING_EXPENSE_RULES_TABLE,
  CREATE_EXPENSES_TABLE,
  CREATE_EXPENSES_RECURRING_UNIQUE_INDEX,
  CREATE_INCOMES_TABLE,
  CREATE_INCOME_RECEIPTS_TABLE,
  CREATE_REMINDERS_TABLE,
  CREATE_REMINDERS_UNIQUE_INDEX,
  CREATE_FUNDS_TABLE,
  CREATE_FUND_TRANSACTIONS_TABLE,
  CREATE_PLAID_ITEMS_TABLE,
] as const;

export const ALL_SEEDS = [SEED_PLACEHOLDER_CURRENCY] as const;
