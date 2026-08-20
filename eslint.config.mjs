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
    // Vendored minified opus-recorder encoder worker (served statically).
    "public/opus/**",
    // backend/ is the NestJS API — a separate project with its own tsconfig
    // and lint story. Its compiled output (backend/dist) was being linted as
    // if it were app source, which is where every single one of this config's
    // reported errors came from: generated JS failing rules written for
    // hand-written TSX. Linting build output hides real findings in noise.
    "backend/**",
  ]),
]);

export default eslintConfig;
