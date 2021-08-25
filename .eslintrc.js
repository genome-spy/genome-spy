module.exports = {
    env: {
        browser: true,
        es6: true,
    },
    extends: ["eslint:recommended", "prettier"],
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
    },
    rules: {
        "no-new-func": "off",
        "no-bitwise": "off",
        "no-undefined": "off",
        "no-nested-ternary": "off",
        "dot-notation": "off",
        "no-unused-vars": ["error", { args: "none" }],
        "require-await": "warn",
    },
};
