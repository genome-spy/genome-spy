export const SDF_PADDING = 5; // Not sure if this is same with all msdf bmfonts...

/**
 * Metrics calculation for msdf bmfonts:
 * https://github.com/etiennepinchon/aframe-fonts
 *
 * @param {import("../fonts/types").FontMetadata} metadata
 */
export default function getMetrics(metadata) {
    /** @type {import("../fonts/types").Char[]} */
    const asciiChars = new Array(256);

    /** @type {Map<number, import("../fonts/types").Char>} */
    const unicodeChars = new Map();

    for (const char of metadata.chars) {
        if (char.id < 256) {
            asciiChars[char.id] = char;
        } else {
            unicodeChars.set(char.id, char);
        }
    }

    /** @param {number} charCode */
    function getCharByCode(charCode) {
        const char =
            charCode < 256 ? asciiChars[charCode] : unicodeChars.get(charCode);
        return char || asciiChars[63];
    }

    /** @param {string} char */
    function getChar(char) {
        return getCharByCode(char.charCodeAt(0));
    }

    const base = metadata.common.base;

    // Font metrics are not available in the bmfont metadata. Have to calculate...
    const x = getChar("x");
    const X = getChar("X");
    const q = getChar("q");

    const xHeight = x.height - SDF_PADDING * 2;
    const capHeight = X.height - SDF_PADDING * 2;
    const descent = q.height - x.height + q.yoffset - x.yoffset;

    /**
     *
     * @param {string} text text to measure
     * @param {number} fontSize
     */
    function measureWidth(text, fontSize = 1.0) {
        let width = 0;
        for (let i = 0; i < text.length; i++) {
            width += getCharByCode(text.charCodeAt(i)).xadvance;
        }

        return (width / base) * fontSize;
    }

    return {
        measureWidth,
        getCharByCode,
        getChar,
        xHeight,
        capHeight,
        descent
    };
}
