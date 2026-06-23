// Enforces minimum coverage thresholds against coverage/coverage-summary.json
// (produced by `hardhat coverage` via the json-summary reporter in .solcover.js).
//
// Fork-aware: the test suite skips without MAINNET_RPC_URL, which would make
// coverage ~0%. So this check is a no-op (exit 0) unless a fork RPC is set —
// matching the test/coverage gating elsewhere. Enforced for real in CI where
// the RPC secret is present.
const fs = require("fs");
const path = require("path");

const THRESHOLDS = { lines: 80, statements: 80, functions: 80, branches: 60 };

if (!process.env.MAINNET_RPC_URL) {
  console.warn(
    "⚠️  Skipping coverage threshold check: MAINNET_RPC_URL unset (fork-gated tests produce no meaningful coverage).",
  );
  process.exit(0);
}

const summaryPath = path.join(
  __dirname,
  "..",
  "coverage",
  "coverage-summary.json",
);
if (!fs.existsSync(summaryPath)) {
  console.error(
    `Coverage summary not found at ${summaryPath}. Run \`npm run coverage\` first.`,
  );
  process.exit(1);
}

const { total } = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
let failed = false;
for (const [metric, min] of Object.entries(THRESHOLDS)) {
  const pct = total[metric].pct;
  const ok = pct >= min;
  console.log(`${ok ? "✓" : "✗"} ${metric}: ${pct}% (min ${min}%)`);
  if (!ok) failed = true;
}

if (failed) {
  console.error("\nCoverage below threshold.");
  process.exit(1);
}
console.log("\nCoverage thresholds met.");
