import LinkProgram from "./programs/linkProgram.js";

/** @type {import("../index.d.ts").MarkDefinition<import("../index.d.ts").MarkConfig<"link">>} */
export const linkMark = Object.freeze({
    type: "link",
    createProgram(renderer, config) {
        return new LinkProgram(/** @type {any} */ (renderer), config);
    },
});
