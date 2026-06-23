module.exports = {
  // Interfaces have no executable logic — keep them out of the coverage denominator.
  skipFiles: ["interfaces"],
  // json-summary feeds scripts/check-coverage.js; lcov/text for humans & CI.
  istanbulReporter: ["text", "lcov", "json-summary"],
};
