import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    // O React Compiler não está habilitado neste projeto. Essas regras do
    // preset "latest" rejeitam padrões controlados já usados nos formulários
    // e nos componentes oficiais do shadcn, sem indicar erro de runtime.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
    },
  },
  globalIgnores([".next/**", "next-env.d.ts"]),
]);
