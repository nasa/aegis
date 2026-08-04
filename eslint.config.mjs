import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import prettier from "eslint-plugin-prettier";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import cssModules from "eslint-plugin-css-modules";
import packageJson from "eslint-plugin-package-json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: [
      "**/public/**/*",
      "out/**/*",
      "**/coverage",
      "**/.local",
      "playwright-report/**",
      "test-results/**",
      // Vendored `@emss/*` stand-ins that emulate third-party packages; see emss-fallback/README.md.
      "emss-fallback/**",
    ],
  },
  ...fixupConfigRules(compat.extends("prettier", "plugin:react-hooks/recommended")),

  // Configuration specifically for package.json files
  {
    ...packageJson.configs.recommended,
    files: ["**/package.json"],
    rules: {
      "package-json/restrict-dependency-ranges": [
        "error",
        {
          rangeType: "pin", // require that packages have pinned versions
        },
      ],
    },
  },

  // Configuration for JavaScript and TypeScript files
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      react,
      "react-hooks": fixupPluginRules(reactHooks),
      "@typescript-eslint": typescriptEslint,
      prettier,
      "css-modules": fixupPluginRules(cssModules),
    },

    languageOptions: {
      globals: { ...globals.browser },

      parser: tsParser,
      ecmaVersion: 12,
      sourceType: "module",

      parserOptions: { ecmaFeatures: { jsx: true } },
    },

    settings: { react: { version: "detect" } },

    rules: {
      "no-warning-comments": ["error", { terms: ["fixme", "tbd", "xxx"], location: "anywhere" }],

      "no-implied-eval": "error",
      "no-bitwise": "error",
      "no-eval": "error",
      "no-extend-native": "error",
      "no-array-constructor": "error",
      "no-caller": "error",

      "no-constant-condition": ["error", { checkLoops: false }],

      "no-empty": ["error", { allowEmptyCatch: true }],

      "no-extra-bind": "error",
      "no-extra-label": "error",

      "no-implicit-coercion": ["error", { string: true, boolean: false, number: false }],

      "no-implicit-globals": "error",
      "no-label-var": "error",
      "no-loop-func": "error",
      "no-multi-spaces": "error",
      "no-multi-str": "error",
      "no-new": "error",
      "no-new-func": "error",
      "no-new-object": "error",
      "no-new-wrappers": "error",
      "no-octal-escape": "error",
      "no-proto": "error",
      "no-prototype-builtins": "error",

      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lodash",
              message:
                "Please import only the functions you need from lodash, e.g., import sortBy from 'lodash/sortBy'.",
            },
            {
              name: "react-redux",
              importNames: ["useSelector", "shallowEqual"],
              message:
                "Use useAppSelector() instead of useSelector(), and refEqual()/shallowEqual()/deepEqual() from useAppSelector.ts versus other locations. These functions provide better Aegis-specific defaults.",
            },
            {
              name: "assert",
              importNames: ["deepEqual"],
              message: "Use 'useAppSelector.ts/deepEqual'.",
            },
            {
              name: "react-redux",
              importNames: ["useDispatch"],
              message:
                "Use utils/useAppDispatch() instead of useDispatch(). This will allow usage of the full store types",
            },
          ],
          patterns: [
            {
              group: ["**/consoleLogger", "**/consoleLogger.ts", "utils/logging/consoleLogger"],
              message:
                "Import from 'utils/logging/clientLogger' or 'utils/logging/serverLogger' instead. Alias as: { ConsoleLogger as clientLogger } or { ConsoleLogger as serverLogger }.",
            },
          ],
        },
      ],

      "no-return-assign": "error",
      "no-script-url": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-self-compare": "error",
      "no-sequences": "error",
      "no-shadow-restricted-names": "error",
      "no-throw-literal": "error",
      "no-unmodified-loop-condition": "error",

      "no-unneeded-ternary": ["error", { defaultAssignment: false }],

      "no-unused-expressions": "error",
      "no-useless-call": "error",
      "no-void": "error",
      "no-with": "error",
      "prefer-numeric-literals": "error",
      "unicode-bom": ["error"],
      "no-misleading-character-class": "error",
      "no-new-require": "error",
      "no-useless-computed-key": "error",
      "prefer-const": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],

      "prettier/prettier": ["error", { endOfLine: "auto", trailingComma: "es5" }],

      "no-import-assign": "error",
      "no-unreachable": "error",
      "react/jsx-no-target-blank": "error", // prevent security vulnerability: require rel="noopener noreferrer" with target="_blank"
      "linebreak-style": ["error", "unix"], // enforce unix (lf) linebreaks
      "react-hooks/set-state-in-effect": "off",

      // Add recommended CSS Modules rules
      // ...cssModules.configs.recommended.rules,

      // User's specific CSS Modules rules (these will override recommended if there are conflicts)
      // "css-modules/no-undef-class": ["error", { camelCase: true }],
      // "css-modules/no-unused-class": ["error", { camelCase: true }],
    },
  },

  // disable the consistent-type-imports rule in .d.ts files where we use inline import syntax to reference external types
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },

  // Allow clientLogger.ts, serverLogger.ts, and tests to import directly from consoleLogger
  {
    files: [
      "src/utils/logging/clientLogger.ts",
      "src/utils/logging/serverLogger.ts",
      "src/tests/**/consoleLogger.test.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },

  // Atomicity: forbid inner apply* and stage* helpers from
  // touching the Automerge doc handle directly. They must remain pure
  // functions so callers can compose them inside a
  // single atomic `.change()` block. See `src/operations/README.md`
  // for the three-layer convention.
  {
    files: ["src/**"],
    ignores: [
      "src/client/automergeDocHandles.ts", // defines withMissionChange + getMissionDocHandle
      "src/store/thunk/**", // thunks may use the handle directly
      "src/tests/**", // tests stub the handle directly
      "src/server/**", // server code is separate
      "src/operations/**", // operations layer may call .change() directly (used on both client and server)
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='change'][callee.object.type='Identifier'][callee.object.name=/DocHandle$/]",
          message:
            "Direct .change() on the mission doc handle is reserved. Use withMissionChange((m) => applyFoo(m, args)) instead.",
        },
        {
          selector: "CallExpression[callee.name='getMissionDocHandle']",
          message:
            "Direct getMissionDocHandle() access is reserved. For mutations, use withMissionChange. For reads, prefer a selector or pass the Mission into your apply/stage function.",
        },
      ],
    },
  },
  {
    files: ["src/operations/apply/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "src/operations/apply",
              message:
                "apply* helpers must be pure sync functions over a Mission doc. They cannot call missionDocHandle.change() — only op* / thunk* functions may. See src/operations/README.md.",
            },
          ],
          patterns: [
            {
              group: ["**/automergeDocHandles", "**/automergeDocHandles.ts"],
              message:
                "apply* helpers must be pure sync functions over a Mission doc. They cannot call missionDocHandle.change() — only op* / thunk* functions may. See src/operations/README.md.",
            },
            {
              group: ["store/thunk/**", "**/store/thunk/**"],
              message:
                "apply* helpers must not depend on thunks (no Redux, no async). Keep them pure. See src/operations/README.md.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/client/automerge/stage/**", "src/operations/stage/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "client/automergeDocHandles",
              message:
                "stage* helpers must receive a Mission as a parameter — they cannot call missionDocHandle.change() or read the live doc directly. See src/operations/README.md.",
            },
          ],
          patterns: [
            {
              group: ["**/automergeDocHandles", "**/automergeDocHandles.ts"],
              message:
                "stage* helpers must receive a Mission as a parameter — they cannot call missionDocHandle.change() or read the live doc directly. See src/operations/README.md.",
            },
            {
              // Allow only read-only data-fetching thunks (currently: thunkFetchElevation).
              // Mutation thunks would break the single-.change() atomicity guarantee.
              group: ["store/thunk/**", "**/store/thunk/**"],
              allowImportNames: ["thunkFetchElevation"],
              message:
                "stage* helpers may only import read-only data-fetching thunks (currently: thunkFetchElevation). Any thunk that calls .change() would break the single-patch atomicity guarantee. See src/operations/README.md.",
            },
          ],
        },
      ],
    },
  },
];
