import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "@typescript-eslint/eslint-plugin";

export default defineConfig(
    {
        name: "genomespy/linter-options",
        linterOptions: {
            reportUnusedDisableDirectives: "error",
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

    {
        name: "genomespy/tests",
        files: ["packages/*/src/**/*.test.js"],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.vitest,
            },
        },
    },

    {
        name: "genomespy/webgpu-renderer",
        files: ["packages/webgpu-renderer/**/*.{js,mjs,cjs}"],
        languageOptions: {
            globals: {
                ...globals.browser,
                GPUBufferUsage: "readonly",
                GPUMapMode: "readonly",
                GPUShaderStage: "readonly",
                GPUTextureUsage: "readonly",
            },
        },
    },

    {
        name: "genomespy/webgpu-renderer-node-files",
        files: [
            "packages/webgpu-renderer/scripts/**/*.{js,mjs,cjs}",
            "packages/webgpu-renderer/tests/**/*.{js,mjs,cjs}",
            "packages/webgpu-renderer/stories/**/*.{js,mjs,cjs}",
        ],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.vitest,
                GPUBufferUsage: "readonly",
                GPUMapMode: "readonly",
                GPUShaderStage: "readonly",
                GPUTextureUsage: "readonly",
            },
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
    },
    {
        name: "genomespy/webgpu-renderer-redeclarations",
        files: ["packages/webgpu-renderer/**/*.{js,mjs,cjs}"],
        rules: {
            "no-redeclare": "off",
        },
    }
);
