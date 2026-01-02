import BmFontManager from "./bmFontManager.js";

/**
 * @typedef {import("./bmFontManager.js").default} BmFontManagerType
 * @typedef {import("./bmFontMetrics.js").BMFontMetrics} BMFontMetrics
 *
 * @typedef {object} FontSpec
 * @prop {string} family
 * @prop {"normal"|"italic"} [style]
 * @prop {number|"thin"|"light"|"regular"|"normal"|"medium"|"bold"|"black"} [weight]
 *
 * @typedef {object} TextLayout
 * @prop {Uint32Array} glyphIds
 * @prop {Uint32Array} stringIndex
 * @prop {Float32Array} xOffset
 * @prop {Float32Array | null} yOffset
 * @prop {Float32Array} textWidth
 * @prop {Float32Array} textHeight
 * @prop {number} fontSize
 * @prop {number} lineAdvance
 * @prop {number} ascent
 * @prop {number} descent
 */

/**
 * Build glyph layout data from strings and BMFont metrics.
 *
 * This is renderer-agnostic: it does not depend on SDF details or GPU resources.
 *
 * @param {object} params
 * @param {string[] | string} params.strings
 * @param {BmFontManagerType} [params.fontManager]
 * @param {FontSpec} [params.font]
 * @param {number} [params.fontSize]
 * @param {number} [params.lineHeight]
 * @param {number} [params.letterSpacing]
 * @returns {TextLayout}
 */
export function buildTextLayout({
    strings,
    fontManager = new BmFontManager(),
    font = { family: "Lato", style: "normal", weight: 400 },
    fontSize = 12,
    lineHeight = 1.0,
    letterSpacing = 0,
}) {
    const textArray = Array.isArray(strings) ? strings : [strings];
    const resolvedStyle = font.style === "italic" ? "italic" : "normal";
    const fontEntry = fontManager.getFont(
        font.family,
        resolvedStyle,
        font.weight ?? 400
    );
    const metrics = /** @type {BMFontMetrics} */ (fontEntry.metrics);
    const base = metrics.common.base;
    const scale = fontSize / base;
    const lineAdvance = metrics.common.lineHeight * scale * lineHeight;
    const ascent = metrics.common.base * scale;
    const descent = metrics.descent * scale;
    const letterSpacingFont = letterSpacing / scale;

    let glyphCount = 0;
    let needsY = false;
    for (const text of textArray) {
        if (text.includes("\n")) {
            needsY = true;
        }
        for (const ch of text) {
            if (ch === "\n") {
                continue;
            }
            glyphCount += 1;
        }
    }

    const glyphIds = new Uint32Array(glyphCount);
    const stringIndex = new Uint32Array(glyphCount);
    const xOffset = new Float32Array(glyphCount);
    const yOffset = needsY ? new Float32Array(glyphCount) : null;
    const textWidth = new Float32Array(textArray.length);
    const textHeight = new Float32Array(textArray.length);

    let cursor = 0;
    for (let i = 0; i < textArray.length; i++) {
        const text = textArray[i];
        let penX = 0;
        let maxWidthPx = 0;
        let lineWidthPx = 0;
        let lineIndex = 0;
        let lineGlyphs = 0;

        const finalizeLine = () => {
            if (lineGlyphs > 0 && letterSpacing !== 0) {
                lineWidthPx -= letterSpacing;
            }
            if (lineWidthPx > maxWidthPx) {
                maxWidthPx = lineWidthPx;
            }
            lineWidthPx = 0;
            lineGlyphs = 0;
            penX = 0;
        };

        for (const ch of text) {
            if (ch === "\n") {
                finalizeLine();
                lineIndex += 1;
                continue;
            }
            const charCode = ch.codePointAt(0);
            const glyph = metrics.getCharByCode(charCode);
            glyphIds[cursor] = glyph.id >>> 0;
            stringIndex[cursor] = i;
            xOffset[cursor] = penX * scale;
            if (yOffset) {
                yOffset[cursor] = -lineIndex * lineAdvance;
            }
            penX += glyph.xadvance + letterSpacingFont;
            lineWidthPx += (glyph.xadvance + letterSpacingFont) * scale;
            lineGlyphs += 1;
            cursor += 1;
        }

        finalizeLine();
        textWidth[i] = maxWidthPx;
        textHeight[i] = Math.max(1, lineIndex + 1) * lineAdvance;
    }

    return {
        glyphIds,
        stringIndex,
        xOffset,
        yOffset,
        textWidth,
        textHeight,
        fontSize,
        lineAdvance,
        ascent,
        descent,
    };
}
