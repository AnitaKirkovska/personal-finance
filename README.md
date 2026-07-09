<div align="center">

# personal-finance

**Track expenses, income, recurring bills, and savings from your assistant**

![version](https://img.shields.io/badge/version-0.1.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![made for](https://img.shields.io/badge/made%20for-Vellum-8A2BE2)

[What You Get](#what-you-get) - [Requirements](#requirements) - [Install](#install) - [Surfaces](#surfaces) - [Usage](#usage)

</div>

---

Personal finance for your Vellum assistant. Log expenses and income, set up recurring bills, manage savings funds, and get financial summaries. All data lives in a local SQLite database on your machine. Nothing leaves your device.

## What you get

- **Multi-currency expense tracking.** Log expenses manually or from receipt images. The assistant extracts the data from photos you send.
- **Income management.** Track expected income and record payments as they arrive. One-time or recurring.
- **Recurring bills.** Set up rules for rent, subscriptions, and loan payments. The daily sync auto-generates instances and reminds you before they're due.
- **Savings funds.** Create savings goals with targets, track deposits and withdrawals, and see your progress.
- **Financial summaries.** Get a breakdown of income, expenses, pending payments, and category spending for any period.
- **Allocation planning.** When a payment comes in, see exactly what's committed and what's left over.
- **Receipt OCR.** Send a photo of a receipt and the assistant reads the merchant, amount, date, and items for you.
- **Bank sync via Plaid.** Connect your bank account once and auto-import transactions. Cursor-based sync only pulls new data since the last pull.

## Requirements

- **Node.js 24+** for the built-in `node:sqlite` module. Node 22+ works if `better-sqlite3` is installed as a fallback.
- **Plaid account** (optional) for bank sync. Free sandbox tier works for testing. Set `PLAID_CLIENT_ID` and `PLAID_SECRET` as environment variables or plugin credentials. Set `PLAID_ENV` to `sandbox` (default), `development`, or `production`.

## Install

```
assistant plugins install personal-finance
```

First use: the assistant will ask you to configure your currency, then you can start logging expenses right away.

## Surfaces

| Surface | What it does |
| --- | --- |
| `manage_currency` (tool) | Add, list, or set the default currency |
| `log_expense_manual` (tool) | Log an expense with amount, description, and due date |
| `log_expense_from_receipt` (tool) | Log an expense from receipt data with a two-step confirm flow |
| `log_income` (tool) | Record expected income (one-time or recurring) |
| `log_income_receipt` (tool) | Record a received payment linked to an income entry |
| `add_recurring_expense` (tool) | Create a recurring expense rule (rent, subscriptions, etc) |
| `mark_expense_paid` (tool) | Mark an existing expense as paid |
| `get_financial_summary` (tool) | Get income, expenses, balance, and category breakdown for a period |
| `list_expenses` (tool) | List and filter expenses by period, status, category, or search |
| `list_incomes` (tool) | List income entries and optionally their received payments |
| `run_daily_sync` (tool) | Generate recurring instances, mark overdue, return reminders |
| `manage_fund` (tool) | Create, list, deposit, withdraw, or archive savings funds and accounts |
| `plan_allocation` (tool) | Show commitments and remaining balance for a given income amount |
| `link_bank` (tool) | Connect a bank account via Plaid Link (two-step: get URL, then exchange public token) |
| `sync_bank_transactions` (tool) | Pull new transactions from connected banks and auto-log them as expenses |
| `init` (hook) | Initialize the SQLite database on plugin load |
| `personal-finance` (skill) | The finance management workflow and routing logic |

## Usage

- "I spent $45 on groceries at Trader Joe's today"
- "Log my rent, $1800, due on the 1st of every month"
- "I just got paid $3200 for my salary, how should I allocate it?"
- "Show me my spending this month"
- "I'm saving for a trip to Japan, create a fund with a $5000 target"
- "What bills are due this week?"
- "Here's a receipt, log it for me"
- "Connect my bank account so transactions import automatically"
- "Sync my bank transactions"

## License

MIT
