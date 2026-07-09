import type { ToolDefinition } from "@vellumai/plugin-api";
import { getDb, queryRun, queryGet } from "../src/db.js";
import { todayISO } from "../src/helpers/date-utils.js";

const PLAID_ENV = process.env.PLAID_ENV ?? "sandbox";
const PLAID_HOST = PLAID_ENV === "production"
  ? "https://production.plaid.com"
  : PLAID_ENV === "development"
  ? "https://development.plaid.com"
  : "https://sandbox.plaid.com";

async function getPlaidCreds(ctx: any): Promise<{ clientId: string; secret: string }> {
  // Try to read from plugin credentials (getSecureKeyAsync from plugin-api)
  // Falls back to env vars if not available
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

const tool: ToolDefinition = {
  description:
    "Initiate a bank connection via Plaid Link. Returns a URL the user must open in their browser to log in to their bank. After they complete the flow, they'll get a public_token which they should paste back to you. Then call this tool again with the public_token to exchange it for a stored access token. Use when the user wants to connect their bank account for automatic transaction import.",
  input_schema: {
    type: "object",
    properties: {
      public_token: {
        type: "string",
        description: "The public_token returned by Plaid Link after the user completes the bank login flow. Omit on the first call to get the link URL; include it on the second call to finish the connection.",
      },
    },
  },
  defaultRiskLevel: "medium",
  execute: async (input: any, ctx: any) => {
    const { clientId, secret } = await getPlaidCreds(ctx);
    const db = getDb();

    // Phase 2: exchange public_token for access_token
    if (input.public_token) {
      const resp = await fetch(`${PLAID_HOST}/item/public_token/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          secret: secret,
          public_token: input.public_token,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        return { content: `Failed to exchange public token: ${(err as any).error_message ?? resp.statusText}`, isError: true };
      }

      const data = await resp.json() as any;
      const accessToken = data.access_token;
      const itemId = data.item_id;

      // Store the access token in the database
      // (In production, this should be encrypted at rest)
      queryRun(
        db,
        `INSERT OR REPLACE INTO plaid_items (item_id, access_token, cursor, status, created_at, updated_at)
         VALUES (?, ?, NULL, 'ACTIVE', datetime('now'), datetime('now'))`,
        itemId, accessToken,
      );

      return { content: `Bank account connected successfully! (Item ID: ${itemId}) You can now use sync_bank_transactions to pull your transactions.` };
    }

    // Phase 1: create a link token and return the URL
    const linkResp = await fetch(`${PLAID_HOST}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        secret: secret,
        client_name: "Vellum Personal Finance",
        products: ["transactions"],
        country_codes: ["US"],
        language: "en",
      }),
    });

    if (!linkResp.ok) {
      const err = await linkResp.json().catch(() => ({}));
      return { content: `Failed to create link token: ${(err as any).error_message ?? linkResp.statusText}`, isError: true };
    }

    const linkData = await linkResp.json() as any;
    const linkToken = linkData.link_token;
    const linkUrl = `https://cdn.plaid.com/link/v2/stable/link.html?t=${linkToken}`;

    return {
      content: `Open this URL in your browser to connect your bank:\n\n${linkUrl}\n\nAfter you log in and select your account, you'll see a public_token on the success screen. Paste it back to me and I'll finish the connection.\n\n(Environment: ${PLAID_ENV})`,
    };
  },
};

export default tool;
