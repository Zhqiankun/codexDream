import tsParser from "@typescript-eslint/parser";

export default [
  { ignores: ["out/**", "release/**", "node_modules/**"] },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: { parser: tsParser },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-console": "off",
    },
  },
];
