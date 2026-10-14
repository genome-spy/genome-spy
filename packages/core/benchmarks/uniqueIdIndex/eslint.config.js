import globals from "globals";
import rootConfig from "../../../../eslint.config.js";

export default [
    ...rootConfig,
    {
        files: ["**/*.{js,mjs}"],
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
        },
    },
];
