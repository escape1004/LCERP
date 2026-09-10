const js = require("@eslint/js");
const globals = require("globals");
const reactHooks = require("eslint-plugin-react-hooks");
const reactRefresh = require("eslint-plugin-react-refresh");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  { ignores: ["dist", "dist-electron-app", "src/**/*.test.ts", "src/test/**", "vitest.config.ts", "vitest.config.mts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["src/main/**/*.ts"],
    ignores: ["src/main/preload.ts"],
    rules: {
      "prefer-const": "off",
      "no-control-regex": "off",
      "no-useless-escape": "off",
      "no-async-promise-executor": "off",
    },
  }
);
