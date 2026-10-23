// Lists commits since the newest changelog entry so a release note can be written before pushing to main.
// Usage: npm run changelog:check
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const source = readFileSync("lib/changelog/entries.ts", "utf8");
const last = [...source.matchAll(/date:\s*"(\d{4}-\d{2}-\d{2})"/g)]
  .map((m) => m[1])
  .sort((a, b) => a.localeCompare(b))
  .at(-1);
if (!last) throw new Error("No changelog entries found in lib/changelog/entries.ts");

const log = execFileSync(
  "git",
  ["log", `--since=${last} 23:59:59`, "--pretty=%h\t%ad\t%s", "--date=short", "--no-merges"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean)
  .map((line) => line.split("\t"));

// Words that usually mean a user-visible change; docs, tests, deploy and refactors never count.
const noise = /^(docs?|test|e2e|ci|chore|deploy|refactor|log|note|update docs)/i;
const visible = /\b(add|new|support|fix|show|connect|live|real-time|compact|faster|page|filter|alert|menu)\b/i;

const candidates = log.filter(([, , subject]) => !noise.test(subject) && visible.test(subject));
console.log(`Last changelog entry: ${last}. Commits since: ${log.length}, possible user-facing: ${candidates.length}.`);
for (const [hash, date, subject] of candidates) console.log(`  ${hash} ${date} ${subject}`);
console.log(
  candidates.length >= 5 || log.length >= 15
    ? "\nEnough has accumulated: draft an entry (see CLAUDE.md, \"Changelog\")."
    : "\nNothing substantial yet: no entry needed unless one change is a major feature or an important fix.",
);
