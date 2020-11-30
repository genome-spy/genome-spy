export const SDF_PADDING = 5; // Not sure if this is same with all msdf bmfonts...

const MAX_ASCII = 127;

/**
 * Metrics calculation for msdf bmfonts:
 * https://github.com/etiennepinchon/aframe-fonts
 *
 * @param {import("../fonts/types").FontMetadata} metadata
 */
export default function getMetrics(metadata) {
    /**
     * Use an ordinary array for fast lookup of ascii chars
     *
     * @type {import("../fonts/types").Char[]}
     */
    const asciiChars = [];

    // Ensure that the array is not "holey": https://v8.dev/blog/elements-kinds
    for (let i = 0; i <= MAX_ASCII; i++) {
        asciiChars.push(undefined);
    }

    /**
     * Put the rest (unicode = sparse and infrequent) chars into a map
     *
     * @type {Map<number, import("../fonts/types").Char>}
     */
    const unicodeChars = new Map();

    for (const char of metadata.chars) {
        if (char.id <= MAX_ASCII) {
            asciiChars[char.id] = char;
        } else {
            unicodeChars.set(char.id, char);
        }
    }

    /** @param {number} charCode */
    function getCharByCode(charCode) {
        const char =
            charCode <= MAX_ASCII
                ? asciiChars[charCode]
                : unicodeChars.get(charCode);
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
