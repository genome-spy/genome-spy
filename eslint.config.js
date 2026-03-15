import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
});

export default [
    {
        linterOptions: {
            reportUnusedDisableDirectives: "off",
        },
    },

    {
        ignores: ["**/*.test.js"],
    },

    ...compat.config({
        parser: "@typescript-eslint/parser",
        plugins: ["@typescript-eslint"],
        env: {
            browser: true,
            es6: true,
        },
        extends: [
            "eslint:recommended",
            "plugin:@typescript-eslint/eslint-recommended",
            "plugin:@typescript-eslint/recommended",
            "prettier",
        ],
        parserOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            ecmaFeatures: {
                jsx: true,
            },
        },
        rules: {
            "callback-return": "off",
            "no-new-func": "off",
            "no-bitwise": "off",
            "no-undefined": "off",
            "no-nested-ternary": "off",
            "dot-notation": "off",
            "no-unused-private-class-members": "off",
            "no-useless-assignment": "off",
            "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
            "preserve-caught-error": "off",
            "require-await": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/ban-ts-comment": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-this-alias": "off",
        },
    }),
];
