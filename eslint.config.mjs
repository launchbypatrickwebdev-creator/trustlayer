import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * TrustLayer lint profile.
 *
 * React Compiler / purity rules flag legitimate server patterns
 * (Date.now for deadline display, try/catch around data load in older pages,
 * hydration mount flags). We keep core-web-vitals but relax a few rules that
 * do not affect runtime correctness of the crypto settlement matrix.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      // Supabase RPC / client until generated Database types exist
      "@typescript-eslint/no-explicit-any": "off",
      // Server Components: deadline checks, wallet mount, object URL previews
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/error-boundaries": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@next/next/no-img-element": "warn",
      "prefer-const": "warn",
    },
  },
]);

export default eslintConfig;
