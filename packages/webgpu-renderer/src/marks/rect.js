import RectProgram from "./programs/rectProgram.js";

/** @type {import("../index.d.ts").MarkDefinition<import("../index.d.ts").MarkConfig<"rect">>} */
export const rectMark = Object.freeze({
    type: "rect",
    createProgram(renderer, config, context) {
        return new RectProgram(/** @type {any} */ (renderer), config, context);
    },
});
