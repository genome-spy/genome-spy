import RuleProgram from "./programs/ruleProgram.js";

/** @type {import("../index.d.ts").MarkDefinition<import("../index.d.ts").MarkConfig<"rule">>} */
export const ruleMark = Object.freeze({
    type: "rule",
    createProgram(renderer, config) {
        return new RuleProgram(/** @type {any} */ (renderer), config);
    },
});
