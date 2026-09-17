/* global performance */

import { createExampleRenderer, setupResize } from "./utils.js";
import { createTrueTypeFont } from "../src/fonts/trueTypeFont.js";
import { textMark } from "../src/marks/text.js";
import { identityScale } from "../src/scales/identity.js";

const FONT_URL = new URL("../src/fonts/DefaultFont.ttf", import.meta.url);

const LINES = [
    { text: "GenomeSpy WebGPU", x: 32, baseline: 105, size: 76, stroke: 0 },
    {
        text: "MSDF text: sharp & scalable!",
        x: 32,
        baseline: 205,
        size: 45,
        stroke: 1.5,
    },
    {
        text: "ASCII 0123456789 !?@#%",
        x: 32,
        baseline: 282,
        size: 32,
        stroke: 2.5,
    },
];

/**
 * @param {ReturnType<import("../tests/oracles/createAsciiTrueTypeFont.js").createAsciiTrueTypeFont>} font
 * @param {typeof LINES} [lines]
 */
export function layoutPathTextLines(font, lines = LINES) {
    const instances = [];
    for (const line of lines) {
        const scale = line.size / font.unitsPerEm;
        const glyphs = Array.from(line.text, (character) => {
            const glyph = font.characters.get(character);
            if (!glyph) {
                throw new Error(
                    `Path text PoC has no ASCII glyph for ${character}.`
                );
            }
            return glyph;
        });
        const adjustments = glyphs.map(() => ({
            placement: 0,
            advance: 0,
        }));
        for (let index = 0; index + 1 < glyphs.length; index++) {
            const pair = font.getPairAdjustment(
                glyphs[index].glyphId,
                glyphs[index + 1].glyphId
            );
            adjustments[index].placement += pair.firstPlacement;
            adjustments[index].advance += pair.firstAdvance;
            adjustments[index + 1].placement += pair.secondPlacement;
            adjustments[index + 1].advance += pair.secondAdvance;
        }
        let penX = line.x;
        for (let index = 0; index < glyphs.length; index++) {
            const glyph = glyphs[index];
            const adjustment = adjustments[index];
            if (glyph.pathIndex >= 0 && glyph.bounds) {
                instances.push({
                    x:
                        penX +
                        adjustment.placement * scale +
                        (glyph.bounds.xMin + glyph.bounds.xMax) * 0.5 * scale,
                    y:
                        line.baseline -
                        (glyph.bounds.yMin + glyph.bounds.yMax) * 0.5 * scale,
                    size: line.size * line.size,
                    shape: glyph.pathIndex,
                    strokeWidth: line.stroke,
                });
            }
            penX += (glyph.advanceWidth + adjustment.advance) * scale;
        }
    }
    return instances;
}

/** @param {ReturnType<import("../tests/oracles/createAsciiTrueTypeFont.js").createAsciiTrueTypeFont>} font */
export function getPathTextAtlasOptions(font) {
    return {
        tileSize: 128,
        shapePadding: 24,
        spread: 24,
        normalizationSpan: font.unitsPerEm,
    };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runPathTextScene(canvas) {
    const response = await fetch(FONT_URL);
    if (!response.ok) {
        throw new Error(`Could not load Default Font: ${response.status}.`);
    }
    const parseStart = performance.now();
    const bytes = await response.arrayBuffer();
    const outlineFont = createTrueTypeFont(bytes);
    const parseDuration = performance.now() - parseStart;

    const renderer = await createExampleRenderer(canvas);
    renderer.createMark(textMark, {
        count: LINES.length,
        font: outlineFont,
        fontSize: 32,
        channels: {
            text: { data: LINES.map((line) => line.text) },
            x: {
                data: Float32Array.from(LINES, (line) => line.x),
                type: "f32",
                scale: identityScale(),
            },
            y: {
                data: Float32Array.from(LINES, (line) => line.baseline),
                type: "f32",
                scale: identityScale(),
            },
            size: {
                data: Float32Array.from(LINES, (line) => line.size),
                type: "f32",
            },
            align: { value: 0, type: "u32" },
            baseline: { value: 0, type: "u32" },
            fill: { value: [0.12, 0.33, 0.75, 1.0] },
            stroke: { value: [0.02, 0.03, 0.06, 1.0] },
            strokeWidth: {
                data: Float32Array.from(LINES, (line) => line.stroke),
                type: "f32",
            },
        },
    });

    const cleanupResize = setupResize(canvas, renderer);
    renderer.render();
    console.info(
        `Path text parsed Default Font in ${parseDuration.toFixed(1)} ms.`
    );

    return () => {
        cleanupResize();
        renderer.destroy();
    };
}
