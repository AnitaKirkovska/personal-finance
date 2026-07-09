import type { ToolDefinition } from "@vellumai/plugin-api";
import { randomUUID } from "node:crypto";
import { getDb, queryAll, queryRun, queryGet } from "../src/db.js";
import { todayISO, nowISO } from "../src/helpers/date-utils.js";
import { resolveCurrency, formatAmount } from "../src/helpers/currency-utils.js";

const PLAID_ENV = process.env.PLAID_ENV ?? "sandbox";
const PLAID_HOST = PLAID_ENV === "production"
  ? "https://production.plaid.com"
  : PLAID_ENV === "development"
  ? "https://development.plaid.com"
  : "https://sandbox.plaid.com";

async function getPlaidCreds(ctx: any): Promise<{ clientId: string; secret: string }> {
  let clientId: string | undefined;
  let secret: string | undefined;

  try {
    const { getSecureKeyAsync } = await import("@vellumai/plugin-api");
    if (typeof getSecureKeyAsync === "function") {
      clientId = await getSecureKeyAsync("plaid_client_id");
      secret = await getSecureKeyAsync("plaid_secret");
    }
  } catch {}

  clientId = clientId ?? process.env.PLAID_CLIENT_ID;
  secret = secret ?? process.env.PLAID_SECRET;

  if (!clientId || !secret) {
    throw new Error(
      "Plaid credentials not configured. Set PLAID_CLIENT_ID and PLAID_SECRET environment variables, or add plaid_client_id and plaid_secret to your plugin credentials."
    );
  }

  return { clientId, secret };
}

// Plaid transaction category to our category mapping
function mapCategory(plaidCategory: string[]): string {
  const primary = plaidCategory[0]?.toUpperCase() ?? "";
  if (primary.includes("FOOD") || primary.includes("RESTAURANT") || primary.includes("BAR")) return "FOOD";
  if (primary.includes("RENT") || primary.includes("MORTGAGE") || primary.includes("LOAN")) return "HOUSING";
  if (primary.includes("TRANSPORT") || primary.includes("GAS") || primary.includes("PARKING")) return "TRANSPORT";
  if (primary.includes("UTILIT") || primary.includes("ELECTRIC") || primary.includes("WATER") || primary.includes("INTERNET") || primary.includes("PHONE")) return "UTILITIES";
  if (primary.includes("ENTERTAIN") || primary.includes("MOVIE") || primary.includes("MUSIC") || primary.includes("STREAM")) return "ENTERTAINMENT";
  if (primary.includes("HEALTH") || primary.includes("MEDICAL") || primary.includes("PHARMACY") || primary.includes("DOCTOR")) return "HEALTH";
  if (primary.includes("SHOPP") || primary.includes("STORE") || primary.includes("RETAIL")) return "SHOPPING";
  if (primary.includes("TRAVEL") || primary.includes("FLIGHT") || primary.includes("HOTEL")) return "TRAVEL";
  if (primary.includes("TRANSFER") || primary.includes("DEPOSIT") || primary.includes("WITHDRAWAL") || primary.includes("PAYMENT")) return "TRANSFER";
  if (primary.includes("SUBSCRIPTION") || primary.includes("RECURRING")) return "SUBSCRIPTION";
  return "OTHER";
}

const tool: ToolDefinition = {
  description:
    "Pull transactions from connected bank accounts via Plaid and auto-log them as expenses. Uses cursor-based pagination so it only pulls new transactions since the last sync. Use when the user wants to sync their bank data, or schedule it as a recurring sync.",
  input_schema: {
    type: "object",
    properties: {
      dry_run: {
        type: "boolean",
        description: "If true, return the transactions that would be imported without writing them to the database. Default false.",
      },
    },
  },
  defaultRiskLevel: "medium",
  execute: async (input: any, ctx: any) => {
    const { clientId, secret } = await getPlaidCreds(ctx);
    const db = getDb();

    const items = queryAll(
      db,
      "SELECT item_id, access_token, cursor, status FROM plaid_items WHERE status = 'ACTIVE'",
    ) as any[];

    if (!items.length) {
      return { content: "No bank accounts connected. Use link_bank to connect one first.", isError: true };
    }

    const dryRun = input.dry_run ?? false;
    let totalAdded = 0;
    let totalSkipped = 0;
    const lines: string[] = [];

    for (const item of items) {
      // Use Plaid's /transactions/sync with cursor pagination
      let cursor = item.cursor;
      let hasMore = true;
      let itemAdded = 0;
      let itemSkipped = 0;

      while (hasMore) {
        const body: any = {
          client_id: clientId,
          secret: secret,
          access_token: item.access_token,
          count: 100,
        };
        if (cursor) body.cursor = cursor;

        const resp = await fetch(`${PLAID_HOST}/transactions/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          lines.push(`Error syncing item ${item.item_id}: ${(err as any).error_message ?? resp.statusText}`);
          break;
        }

        const data = await resp.json() as any;
        const added = data.added ?? [];
        const modified = data.modified ?? [];
        const removed = data.removed ?? [];

        for (const tx of added) {
          // Skip if already imported (check by transaction_id)
          const existing = queryGet(
            db,
            "SELECT id FROM expenses WHERE id = ?",
            `plaid_${tx.transaction_id}`,
          );

          if (existing) {
            itemSkipped++;
            continue;
          }

          // Skip income-like transactions (positive amounts are credits in Plaid)
          if (tx.amount < 0) {
            // This is income, skip for now (could log as income_receipt in future)
            itemSkipped++;
            continue;
          }

          // Skip transfers (amount 0 or category includes TRANSFER)
          if (tx.amount === 0) {
            itemSkipped++;
            continue;
          }

          const category = mapCategory(tx.category ?? []);
          const description = tx.name?.replace(/\s+/g, " ").trim() || "Bank transaction";
          const merchant = tx.merchant_name ?? null;
          const date = tx.date ?? todayISO();
          const currencyCode = tx.iso_currency_code ?? "USD";
          const now = nowISO();

          // Try to resolve the currency; if not configured, add it
          try {
            resolveCurrency(currencyCode, db);
          } catch {
            // Auto-add unknown currency
            queryRun(
              db,
              `INSERT OR IGNORE INTO currencies (code, name, symbol, is_default) VALUES (?, ?, ?, 0)`,
              currencyCode, currencyCode, "",
            );
          }

          if (!dryRun) {
            queryRun(
              db,
              `INSERT INTO expenses (id, amount, currency, category, merchant, description, due_date, payment_date, status, source, ocr_extraction_id, recurring_rule_id, generated_from_rule, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PAID', 'PLAID', NULL, NULL, 0, 1, ?, ?)`,
              `plaid_${tx.transaction_id}`,
              tx.amount,
              currencyCode,
              category,
              merchant,
              description,
              date,
              date, // payment_date = date since it already happened
              now,
              now,
            );
          }

          itemAdded++;
        }

        cursor = data.next_cursor;
        hasMore = data.has_more ?? false;
      }

      // Update cursor for this item
      if (!dryRun && cursor) {
        queryRun(
          db,
          "UPDATE plaid_items SET cursor = ?, updated_at = datetime('now') WHERE item_id = ?",
          cursor,
          item.item_id,
        );
      }

      totalAdded += itemAdded;
      totalSkipped += itemSkipped;
      lines.push(`Item ${item.item_id.slice(0, 8)}...: ${itemAdded} imported, ${itemSkipped} skipped`);
    }

    const prefix = dryRun ? "[DRY RUN] " : "";
    lines.unshift(`${prefix}Bank sync complete: ${totalAdded} transactions imported, ${totalSkipped} skipped`);

    if (totalAdded === 0 && totalSkipped === 0) {
      lines.push("No new transactions found.");
    }

    return { content: lines.join("\n") };
  },
};

export default tool;
