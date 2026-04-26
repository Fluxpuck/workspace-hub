import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, "../data/store.json");

const store = { workspaces: {} };

/**
 * Load persisted state from disk into the in-memory store.
 * Called once on startup. Silently starts empty if the file is missing or corrupt.
 */
function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const persisted = JSON.parse(raw);
    if (persisted?.workspaces) {
      store.workspaces = persisted.workspaces;
    }
    console.log(`Loaded ${Object.keys(store.workspaces).length} workspace(s) from ${STORE_PATH}`);
  } catch {
    // File missing or corrupt — start fresh
  }
}

/**
 * Persist the current in-memory state to disk.
 * Called after every mutating tool call.
 */
export function saveStore() {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error(`Failed to persist store: ${err.message}`);
  }
}

// Load persisted state on startup
loadStore();

export default store;
