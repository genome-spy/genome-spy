import TextProgram from "./programs/textProgram.js";

/** @type {import("../index.d.ts").MarkDefinition<import("../index.d.ts").MarkConfig<"text">, import("../index.d.ts").TextSeries>} */
export const textMark = Object.freeze({
    type: "text",
    createProgram(renderer, config) {
        return new TextProgram(/** @type {any} */ (renderer), config);
    },
});
