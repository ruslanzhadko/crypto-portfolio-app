import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Docker healthcheck without a database query: a query every 30 s would keep
// Neon awake around the clock. The worker refreshes this file from its event
// loop and creates it only after its first successful database heartbeat.
const MAX_AGE_MS = 90_000;
try {
  const { at } = JSON.parse(
    await readFile(join(process.cwd(), ".worker-run", "alive"), "utf8"),
  );
  if (typeof at !== "number" || Date.now() - at > MAX_AGE_MS)
    process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
