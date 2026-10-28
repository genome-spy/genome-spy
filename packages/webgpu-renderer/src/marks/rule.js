import RuleProgram from "./programs/ruleProgram.js";

/** @type {import("../index.d.ts").MarkDefinition<import("../index.d.ts").MarkConfig<"rule">>} */
export const ruleMark = Object.freeze({
    type: "rule",
    createProgram(renderer, config, context) {
        if (
            config.dashPatterns?.length &&
            ["stroke", "strokeWidth", "strokeOpacity", "strokeAlign"].some(
                (key) => Object.hasOwn(config.channels ?? {}, key)
            )
        ) {
            throw new Error("Rule borders do not support dashPatterns yet.");
        }
        return new RuleProgram(/** @type {any} */ (renderer), config, context);
    },
});
