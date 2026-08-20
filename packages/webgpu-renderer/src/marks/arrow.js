import ArrowProgram from "./programs/arrowProgram.js";

/** @type {import("../index.d.ts").MarkDefinition<import("../index.d.ts").MarkConfig<"arrow">>} */
export const arrowMark = Object.freeze({
    type: "arrow",
    createProgram(renderer, config) {
        return new ArrowProgram(/** @type {any} */ (renderer), config);
    },
});
