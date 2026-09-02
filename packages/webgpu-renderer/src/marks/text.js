import TextProgram from "./programs/textProgram.js";
import { isTrueTypeFont } from "../fonts/outlineTextLayout.js";

/** @type {WeakMap<object, Map<string, object>>} */
const outlineProgramKeys = new WeakMap();

/** @param {import("../index.d.ts").MarkConfig<"text">} config */
function getOutlineProgramKey(config) {
    if (!isTrueTypeFont(config.font)) {
        return "bitmap";
    }
    const font = config.font;
    let keys = outlineProgramKeys.get(font);
    if (!keys) {
        keys = new Map();
        outlineProgramKeys.set(font, keys);
    }
    const text = config.channels?.text;
    const strings =
        text && "data" in text && Array.isArray(text.data)
            ? text.data
            : text && "value" in text && typeof text.value === "string"
              ? [text.value]
              : [];
    const content = JSON.stringify(strings);
    let key = keys.get(content);
    if (!key) {
        key = {};
        keys.set(content, key);
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
