import TextProgram from "./programs/textProgram.js";
import { isTrueTypeFont } from "../fonts/outlineTextLayout.js";
import { hasTextShadow } from "./programs/textRenderItems.js";

/** @type {WeakMap<object, object>} */
const outlineProgramKeys = new WeakMap();

/** @param {import("../index.d.ts").MarkConfig<"text">} config */
function getOutlineProgramKey(config) {
    if (!isTrueTypeFont(config.font)) {
        throw new TypeError("Text marks require a TrueType outline font.");
    }
    const font = config.font;
    if (!hasTextShadow(config.channels)) {
        return font;
    }
    let key = outlineProgramKeys.get(font);
    if (!key) {
        key = {};
        outlineProgramKeys.set(font, key);
    }
    return key;
}

/**
 * @type {import("../index.d.ts").MarkDefinition<
 *   import("../index.d.ts").MarkConfig<"text">,
 *   import("../index.d.ts").TextSeries,
 *   import("../index.d.ts").TextMarkProperties
 * >}
 */
export const textMark = Object.freeze({
    type: "text",
    getProgramKey: getOutlineProgramKey,
    createProgram(renderer, config, context) {
        return new TextProgram(/** @type {any} */ (renderer), config, context);
    },
});
