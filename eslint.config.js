import js from "@eslint/js";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import perfectionist from "eslint-plugin-perfectionist";
import security from "eslint-plugin-security";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  { ignores: ["dist/**", "dist", ".next/**", ".next", "next-env.d.ts"] },
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
  ...nextCoreWebVitals,
  tseslint.configs.recommended,
  security.configs.recommended,
  {
    settings: { react: { version: "detect" } },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: { perfectionist },
    rules: {
      "perfectionist/sort-imports": ["warn", { type: "natural", order: "asc", ignoreCase: true }],
      "perfectionist/sort-exports": ["warn", { type: "natural", order: "asc", ignoreCase: true }],
      "perfectionist/sort-object-types": ["warn", { type: "natural", order: "asc", ignoreCase: true }],
      "perfectionist/sort-jsx-props": ["warn", { type: "natural", order: "asc", ignoreCase: true }],
    },
  },
  {
    files: ["src/components/estudios/study-manager.tsx", "src/app/components/figma/**"],
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    files: ["middleware.ts", "src/app/api/**/*.ts", "src/lib/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
]);