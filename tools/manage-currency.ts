import type { ToolDefinition } from "@vellumai/plugin-api";
import { randomUUID } from "node:crypto";
import { getDb, queryAll, queryRun, queryGet } from "../src/db.js";

const tool: ToolDefinition = {
  description:
    "Manage configured currencies: add a new currency, list all currencies, or set the default currency. Use when the user wants to configure their currencies or check which currencies are available.",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["add", "list", "set_default"],
        description: "What to do: add a currency, list all, or set the default.",
      },
      code: {
        type: "string",
        description: "ISO 4217 currency code (e.g. USD, EUR, MKD). Required for add and set_default.",
      },
      name: {
        type: "string",
        description: "Human-readable currency name (e.g. 'US Dollar'). Required for add.",
      },
      symbol: {
        type: "string",
        description: "Currency symbol (e.g. $, EUR, den). Required for add.",
      },
    },
    required: ["action"],
  },
  defaultRiskLevel: "low",
  execute: async (input: any) => {
    const db = getDb();

    switch (input.action) {
      case "add": {
        if (!input.code || !input.name || !input.symbol) {
          return { content: "Missing required fields for add: code, name, and symbol are required.", isError: true };
        }
        const code = input.code.trim().toUpperCase();
        queryRun(
          db,
          `INSERT OR REPLACE INTO currencies (code, name, symbol, is_default) VALUES (?, ?, ?, 0)`,
          code, input.name.trim(), input.symbol.trim(),
        );
        return { content: `Currency added: ${code} (${input.name}, symbol ${input.symbol}). Use set_default to make it the default.` };
      }
      case "list": {
        const rows = queryAll(db, "SELECT code, name, symbol, is_default FROM currencies ORDER BY is_default DESC, code ASC");
        if (!rows.length) return { content: "No currencies configured." };
        const lines = rows.map((r: any) =>
          `${r.is_default ? "* " : "  "}${r.code} ${r.name} (${r.symbol})${r.is_default ? " [default]" : ""}`
        );
        return { content: `Currencies:\n${lines.join("\n")}` };
      }
      case "set_default": {
        if (!input.code) return { content: "Missing required field: code.", isError: true };
        const code = input.code.trim().toUpperCase();
        const row = queryGet(db, "SELECT code FROM currencies WHERE code = ?", code);
        if (!row) return { content: `Currency ${code} not found. Add it first with action 'add'.`, isError: true };
        queryRun(db, "UPDATE currencies SET is_default = 0");
        queryRun(db, "UPDATE currencies SET is_default = 1 WHERE code = ?", code);
        return { content: `Default currency set to ${code}.` };
      }
      default:
        return { content: `Unknown action: ${input.action}`, isError: true };
    }
  },
};

export default tool;
