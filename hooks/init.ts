import type { PluginHookFn } from "@vellumai/plugin-api";

const onInit: PluginHookFn = async (ctx) => {
  // Initialize the SQLite database on plugin load.
  // The DB file lives in the plugin's data directory.
  const { getDb } = await import("../src/db.js");
  const db = getDb();
  ctx.logger.info({ path: (db as any)?.name ?? "unknown" }, "personal-finance database initialized");
};

export default onInit;
