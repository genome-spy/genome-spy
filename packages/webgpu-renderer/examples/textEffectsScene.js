import { createExampleRenderer, setupResize } from "./utils.js";
import { createTrueTypeFont } from "../src/fonts/trueTypeFont.js";
import { textMark } from "../src/marks/text.js";
import { indexScale } from "../src/scales/index.js";

const FONT_URL = new URL("../src/fonts/DefaultFont.ttf", import.meta.url);
const STRINGS = ["GenomeSpy", "Outlined labels", "SDF glow", "AV M&W 50%"];

/**
 * @typedef {object} TextEffectOptions
 * @prop {number} [size]
 * @prop {number} [angle]
 * @prop {string} [fill]
 * @prop {string} [outlineColor]
 * @prop {number} [outlineWidth]
 * @prop {number} [outlineOpacity]
 * @prop {string} [shadowColor]
 * @prop {number} [shadowOpacity]
 * @prop {number} [shadowBlur]
 * @prop {number} [shadowOffsetX]
 * @prop {number} [shadowOffsetY]
 * @prop {string} [background]
 */

/**
 * @param {string} value
 * @returns {[number, number, number, number]}
 */
function parseColor(value) {
    const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
    if (!match) {
        throw new Error(`Expected an RGB hex color, got "${value}".`);
    }
    return [
        Number.parseInt(match[1], 16) / 255,
        Number.parseInt(match[2], 16) / 255,
        Number.parseInt(match[3], 16) / 255,
        1,
    ];
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {TextEffectOptions} [options]
 * @returns {Promise<{ cleanup: () => void, update: (next: TextEffectOptions) => void }>}
 */
export default async function runTextEffectsScene(canvas, options = {}) {
    const response = await fetch(FONT_URL);
    if (!response.ok) {
        throw new Error(`Could not load Default Font: ${response.status}.`);
    }
    const font = createTrueTypeFont(await response.arrayBuffer());
    const renderer = await createExampleRenderer(canvas);
    const rows = Uint32Array.from(STRINGS, (_, index) => index);

    const initial = {
        size: options.size ?? 64,
        angle: options.angle ?? -6,
        fill: options.fill ?? "#f7f8ff",
        outlineColor: options.outlineColor ?? "#14213d",
        outlineWidth: options.outlineWidth ?? 4,
        outlineOpacity: options.outlineOpacity ?? 1,
        shadowColor: options.shadowColor ?? "#2457ff",
        shadowOpacity: options.shadowOpacity ?? 0.55,
        shadowBlur: options.shadowBlur ?? 7,
        shadowOffsetX: options.shadowOffsetX ?? 5,
        shadowOffsetY: options.shadowOffsetY ?? 7,
        background: options.background ?? "#ffffff",
    };
    canvas.style.backgroundColor = initial.background;

    const { scales, values } = renderer.createMark(textMark, {
        font,
        fontSize: 64,
        channels: {
            text: { data: STRINGS },
            x: {
                value: 0,
                type: "u32",
                scale: indexScale({
                    domain: [0, 1],
                    paddingInner: 0,
                    paddingOuter: 0,
                    align: 0.5,
                    band: 0.5,
                }),
            },
            y: {
                data: rows,
                type: "u32",
                scale: indexScale({
                    domain: [0, STRINGS.length],
                    paddingInner: 0.2,
                    paddingOuter: 0.3,
                    align: 0.5,
                    band: 0.5,
                }),
            },
            size: { value: initial.size, dynamic: true },
            angle: { value: initial.angle, dynamic: true },
            align: { value: 1, type: "u32" },
            baseline: { value: 1, type: "u32" },
            fill: { value: parseColor(initial.fill), dynamic: true },
            stroke: {
                value: parseColor(initial.outlineColor),
                dynamic: true,
            },
            strokeWidth: { value: initial.outlineWidth, dynamic: true },
            strokeOpacity: {
                value: initial.outlineOpacity,
                dynamic: true,
            },
            shadowColor: {
                value: parseColor(initial.shadowColor),
                dynamic: true,
            },
            shadowOpacity: {
                value: initial.shadowOpacity,
                dynamic: true,
            },
            shadowBlur: { value: initial.shadowBlur, dynamic: true },
            shadowOffsetX: {
                value: initial.shadowOffsetX,
                dynamic: true,
            },
            shadowOffsetY: {
                value: initial.shadowOffsetY,
                dynamic: true,
            },
        },
    });

    const updateRanges = ({ width, height }) => {
        scales.x.setRange([0, width]);
        scales.y.setRange([0, height]);
    };
    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    return {
        cleanup: () => {
            cleanupResize();
            renderer.destroy();
        },
        update: (next) => {
            canvas.style.backgroundColor =
                next.background ?? initial.background;
            values.size.set(next.size ?? initial.size);
            values.angle.set(next.angle ?? initial.angle);
            values.fill.set(parseColor(next.fill ?? initial.fill));
            values.stroke.set(
                parseColor(next.outlineColor ?? initial.outlineColor)
            );
            values.strokeWidth.set(next.outlineWidth ?? initial.outlineWidth);
            values.strokeOpacity.set(
                next.outlineOpacity ?? initial.outlineOpacity
            );
            values.shadowColor.set(
                parseColor(next.shadowColor ?? initial.shadowColor)
            );
            values.shadowOpacity.set(
                next.shadowOpacity ?? initial.shadowOpacity
            );
            values.shadowBlur.set(next.shadowBlur ?? initial.shadowBlur);
            values.shadowOffsetX.set(
                next.shadowOffsetX ?? initial.shadowOffsetX
            );
            values.shadowOffsetY.set(
                next.shadowOffsetY ?? initial.shadowOffsetY
            );
            renderer.render();
        },
    };
}
