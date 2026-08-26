import TextProgram from "./programs/textProgram.js";

/**
 * @type {import("../index.d.ts").MarkDefinition<
 *   import("../index.d.ts").MarkConfig<"text">,
 *   import("../index.d.ts").TextSeries,
 *   import("../index.d.ts").TextMarkProperties
 * >}
 */
export const textMark = Object.freeze({
    type: "text",
    createProgram(renderer, config, context) {
        return new TextProgram(/** @type {any} */ (renderer), config, context);
    },
});
