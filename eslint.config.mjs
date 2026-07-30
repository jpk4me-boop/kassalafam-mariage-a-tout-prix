import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Outillage local hors projet, déjà exclu de Git (.gitignore) — la flat
    // config ESLint ne lit pas .gitignore, l'exclusion doit être répétée ici.
    ".claude/**",
    "scratchpad/**",
  ]),
]);

export default eslintConfig;
