import { loadTrueTypeFont } from "./trueTypeFont.js";

export const defaultFontUrl = new URL("./DefaultFont.ttf", import.meta.url);

/** Load the compact plotting-oriented Default Font on first use. */
export function loadDefaultFont() {
    return loadTrueTypeFont(defaultFontUrl);
}
