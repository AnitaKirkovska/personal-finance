---
name: personal-finance
description: >-
  Personal finance management via the personal-finance plugin. Use when the
  user mentions spending money, logging an expense, tracking income, managing
  recurring bills, checking their budget, planning how to allocate a payment,
  managing savings funds, or processing a receipt image.
metadata:
  emoji: "💰"
  vellum:
    display-name: "Personal Finance"
    activation-hints:
      - "User mentions spending money, paying for something, or logging a purchase"
      - "User asks about their budget, expenses, or financial summary"
      - "User mentions recurring bills, subscriptions, or rent"
      - "User receives income and wants to know how to allocate it"
      - "User mentions savings goals or fund management"
      - "User sends a receipt image and wants it logged"
      - "User asks about pending payments or what's due"
    avoid-when:
      - "User asks about business accounting or tax filing"
      - "User wants investment portfolio management"
---

# Personal Finance

You help the user track their personal finances: expenses, income, recurring bills, savings funds, and receipts. All data is stored in a local SQLite database.

## First-time setup

If the user has not configured a currency yet (the placeholder currency XXX is still default), guide them through:

1. Ask what currency they use (e.g. USD, EUR, MKD).
2. Call `manage_currency` with action "add" to add it.
3. Call `manage_currency` with action "set_default" to make it the default.

Do not proceed with logging expenses until a real currency is configured. If a tool response hints about the placeholder currency, relay this to the user.

## Logging expenses

When the user mentions a purchase or bill:

- If they give you the details directly (amount, what it was for, date), use `log_expense_manual`.
- If they send a receipt image, extract the data yourself (merchant, amount, date, items), then call `log_expense_from_receipt` WITHOUT confirm first. Show the user the preview. Only after they confirm, call it again with `confirm: true` and the same fields.
- If they mention a repeating bill (rent, subscription, loan), use `add_recurring_expense` to create a rule. The daily sync will generate instances automatically.

## Logging income

When the user mentions money they expect or received:

- Use `log_income` to record expected income (salary, freelance, etc).
- When they actually receive the payment, use `log_income_receipt` to record it and link it to the income entry.

## Recurring expenses and daily sync

Recurring expense rules generate expense instances automatically when `run_daily_sync` is called. The sync also marks overdue expenses and surfaces payment reminders.

If the user asks "what's due" or "what do I need to pay", run `run_daily_sync` first to generate any missing instances and get reminders, then show them the results.

## Financial summaries

When the user asks about their spending, budget, or financial overview:

- Use `get_financial_summary` with the appropriate period (this_month, last_month, last_30_days, this_year).
- The summary includes income received, total expenses, pending expenses, balance, category breakdown, and active recurring commitments.
- If the user specifies a currency, pass it as the currency filter.

## Listing and searching

- `list_expenses` for browsing/filtering expenses by period, status, category, or search term.
- `list_incomes` for browsing income entries and optionally their received payments.

## Savings funds

- Use `manage_fund` to create savings funds or track accounts.
- Actions: create, list, deposit, withdraw, archive.
- Funds can have contribution amounts (required or optional) and savings targets.

## Planning allocation

When the user receives a payment and wants to know how to allocate it:

- Use `plan_allocation` with the amount and currency.
- It shows pending expenses, recurring commitments, required savings, and remaining balance.
- If the user has income in multiple currencies, call it once per currency.

## Bank sync (Plaid)

When the user wants to connect their bank for automatic transaction import:

1. Call `link_bank` (without public_token) to get a Plaid Link URL.
2. Tell the user to open the URL in their browser and log in to their bank.
3. After they complete the flow, they'll get a public_token. Have them paste it back.
4. Call `link_bank` again with the public_token to exchange it for a stored access token.
5. After that, `sync_bank_transactions` pulls new transactions using cursor-based pagination. Only new transactions since the last sync are imported.

Bank-synced transactions are auto-categorized based on Plaid's category data. Income-like transactions (negative amounts) are skipped. Supports dry_run mode to preview without writing.

Requires Plaid credentials: `plaid_client_id` and `plaid_secret` in plugin credentials, or `PLAID_CLIENT_ID` and `PLAID_SECRET` environment variables. Default environment is sandbox; set `PLAID_ENV` to `development` or `production` for real bank data.

## Currency handling

- All amounts are stored with a currency code.
- The user can have multiple currencies configured.
- Most tools default to the user's default currency if none is specified.
- When showing amounts, always include the currency symbol and code.
- Bank-synced transactions may bring in currencies not yet configured. The sync tool auto-adds unknown currencies.
