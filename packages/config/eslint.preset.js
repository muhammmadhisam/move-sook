// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Shared flat ESLint config (ESLint 9) for MoveSook packages.
 * Apps extend this and add framework-specific configs (e.g. next).
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build/config files (next.config.mjs, *.config.js) execute in Node, so
    // expose its globals — otherwise no-undef flags process/__dirname there.
    files: ["**/*.config.{js,cjs,mjs}"],
    languageOptions: {
      globals: {
        process: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
);
