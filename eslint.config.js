import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/target/**", "**/coverage/**", "apps/gateway/src/data/icon-catalog.ts"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/gateway/**/*.ts", "packages/contracts/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
);
