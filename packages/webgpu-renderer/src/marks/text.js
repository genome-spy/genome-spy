import TextProgram from "./programs/textProgram.js";
import { isTrueTypeFont } from "../fonts/outlineTextLayout.js";
import { resolveTextEffectFlags } from "./programs/textRenderItems.js";

/** @type {WeakMap<object, object[]>} */
const outlineProgramKeys = new WeakMap();

/** @param {import("../index.d.ts").MarkConfig<"text">} config */
function getOutlineProgramKey(config) {
    if (!isTrueTypeFont(config.font)) {
        return "bitmap";
    }
    const font = config.font;
    const effectFlags = resolveTextEffectFlags(config.channels);
    if (effectFlags === 0) {
        return font;
    }
    let keys = outlineProgramKeys.get(font);
    if (!keys) {
        keys = [{}, {}, {}, {}];
        outlineProgramKeys.set(font, keys);
    }
    return keys[effectFlags];
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
