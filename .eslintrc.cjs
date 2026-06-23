/* eslint-env node */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    // Keep eslint-config-prettier last so it disables formatting-related rules.
    "prettier",
  ],
  env: {
    browser: true,
    es2020: true,
    node: true,
    webextensions: true,
  },
  rules: {
    // Phase 0 is a behavior-preserving migration; the legacy class relies on
    // non-null DOM queries and a few permissive casts. Keep these as warnings
    // (or off) so the migration lands clean and later phases can tighten.
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "no-console": "off",
    // Allow intentionally-unused identifiers prefixed with `_` (e.g. params kept
    // for signature stability / future use).
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
  },
  ignorePatterns: ["dist/", "node_modules/", "*.config.js"],
};
