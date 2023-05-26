export const SDF_PADDING = 5; // Not sure if this is same with all msdf bmfonts...

const MAX_ASCII = 127;

/**
 * Metrics calculation for msdf bmfonts:
 *
 * https://github.com/mattdesl/bmfont2json
 * https://github.com/etiennepinchon/aframe-fonts
 *
 * @typedef {import("../types/bmFont").Char} Char
 *
 * @typedef {object} BMFontMetrics
 * @prop {(text: string, fontSize?: number) => number} measureWidth
 * @prop {(charCode: number) => Char} getCharByCode
 * @prop {(char: string) => Char} getChar
 * @prop {number} xHeight
 * @prop {number} capHeight
 * @prop {number} descent
 * @prop {import("../types/bmFont").Common} common
 *
 * @param {import("../types/bmFont").BMFont} bmFont
 * @returns {BMFontMetrics}
 */
export default function getMetrics(bmFont) {
    /**
     * Use an ordinary array for fast lookup of ascii chars
     *
     * @type {import("../types/bmFont").Char[]}
     */
    const asciiChars = [];

    // Ensure that the array is not "holey": https://v8.dev/blog/elements-kinds
    for (let i = 0; i <= MAX_ASCII; i++) {
        asciiChars.push(undefined);
    }

    /**
     * Put the rest (unicode = sparse and infrequent) chars into a map
     *
     * @type {Map<number, Char>}
     */
    const unicodeChars = new Map();

    for (const char of bmFont.chars) {
        if (char.id <= MAX_ASCII) {
            asciiChars[char.id] = char;
        } else {
            unicodeChars.set(char.id, char);
        }
    }

    // Workaround https://github.com/d3/d3-format/commit/39f41940386024d3b8a2172240189a0950c8dd23
    const minusHyphen = 8722;
    if (!unicodeChars.has(minusHyphen)) {
        unicodeChars.set(minusHyphen, asciiChars["-".charCodeAt(0)]);
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

    const base = bmFont.common.base;

    // Font metrics are not available in the bmfont metadata. Have to calculate...
    const x = getChar("x");
    const X = getChar("X");
    const q = getChar("q");

    const xHeight = x.height - SDF_PADDING * 2;
    const capHeight = X.height - SDF_PADDING * 2;
    const descent = q.height - x.height + q.yoffset - x.yoffset;

    /**
     * TODO: Kerning
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
        descent,
        common: bmFont.common,
    };
}
