/* global performance */

import { createExampleRenderer, setupResize } from "./utils.js";
import { createAsciiTrueTypeFont } from "../src/fonts/trueTypeFont.js";
import { pathPointMark } from "../src/marks/pathPoint.js";
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
 * @param {ReturnType<typeof createAsciiTrueTypeFont>} font
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

/** @param {ReturnType<typeof createAsciiTrueTypeFont>} font */
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
 * @param {{ atlasBackend?: "gpu" | "wasm" }} [args]
 * @returns {Promise<() => void>}
 */
export default async function runPathTextScene(canvas, args = {}) {
    const atlasBackend = args.atlasBackend ?? "gpu";
    const atlasFormat = atlasBackend === "gpu" ? "rgba16float" : "rgba8unorm";
    const response = await fetch(FONT_URL);
    if (!response.ok) {
        throw new Error(`Could not load Default Font: ${response.status}.`);
    }
    const parseStart = performance.now();
    const font = createAsciiTrueTypeFont(await response.arrayBuffer());
    const instances = layoutPathTextLines(font);
    const parseDuration = performance.now() - parseStart;
    const count = instances.length;
    const x = Float32Array.from(instances, (instance) => instance.x);
    const y = Float32Array.from(instances, (instance) => instance.y);
    const size = Float32Array.from(instances, (instance) => instance.size);
    const shape = Uint32Array.from(instances, (instance) => instance.shape);
    const strokeWidth = Float32Array.from(
        instances,
        (instance) => instance.strokeWidth
    );
    const atlasOptions = getPathTextAtlasOptions(font);

    const renderer = await createExampleRenderer(canvas);
    const { series } = renderer.createMark(pathPointMark, {
        count,
        paths: font.paths,
        atlasBackend,
        atlasFormat,
        atlasOptions,
        channels: {
            x: { data: x, type: "f32", scale: identityScale() },
            y: { data: y, type: "f32", scale: identityScale() },
            size: { data: size, type: "f32" },
            shape: { data: shape, type: "u32" },
            fill: { value: [0.12, 0.33, 0.75, 1.0] },
            stroke: { value: [0.02, 0.03, 0.06, 1.0] },
            strokeWidth: { data: strokeWidth, type: "f32" },
        },
    });

    const cleanupResize = setupResize(canvas, renderer);
    series.replace({ x, y, size, shape, strokeWidth }, count);
    renderer.render();
    const slotSize = atlasOptions.tileSize + 2 * (atlasOptions.gutter ?? 1);
    const columns = Math.ceil(Math.sqrt(font.paths.length));
    const rows = Math.ceil(font.paths.length / columns);
    console.info(
        `Path text PoC (${atlasBackend}, ${atlasFormat}) parsed ` +
            `${font.paths.length} Default Font ASCII outlines in ` +
            `${parseDuration.toFixed(1)} ms; atlas is ` +
            `${columns * slotSize} x ${rows * slotSize}.`
    );

    return () => {
        cleanupResize();
        renderer.destroy();
    };
}
