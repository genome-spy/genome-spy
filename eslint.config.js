import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "@typescript-eslint/eslint-plugin";

export default defineConfig(
    {
        ignores: ["**/*.test.js"],
    },

    {
        name: "genomespy/linter-options",
        linterOptions: {
            reportUnusedDisableDirectives: "warn",
        },
    },

    {
        name: "genomespy/files",
        files: ["packages/*/src/**/*.{js,mjs,cjs,jsx,ts,tsx,d.ts}"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: globals.browser,
        },
    },

    js.configs.recommended,
    ...tseslint.configs["flat/recommended"],
    eslintConfigPrettier,

    {
        name: "genomespy/customizations",
        rules: {
            "callback-return": "off",
            "no-new-func": "off",
            "no-bitwise": "off",
            "no-undefined": "off",
            "no-nested-ternary": "off",
            "dot-notation": "off",
            "no-unused-vars": ["error", { args: "none" }],
            "require-await": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/ban-ts-comment": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-this-alias": "off",
        },
    }
);
