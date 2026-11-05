import { createExampleRenderer, setupResize } from "./utils.js";
import { rectMark } from "../src/marks/rect.js";
import { indexScale } from "../src/scales/index.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{strokeAlign?: number, strokeOpacity?: number, cornerRadius?: number}} [options]
 * @returns {Promise<{cleanup: () => void, update: (options: {strokeAlign?: number, strokeOpacity?: number, cornerRadius?: number}) => void}>}
 */
export default async function runHatchScene(canvas, options = {}) {
    const renderer = await createExampleRenderer(canvas);

    const hatchCols = 5;
    const hatchRows = 4;
    const hatchCount = hatchCols * hatchRows;
    const hatchSize = 50;
    const hatchGap = 12;
    const hatchOrigin = { x: 20, y: 20 };
    const hx = new Uint32Array(hatchCount);
    const hy = new Uint32Array(hatchCount);
    const hatchPattern = new Uint32Array(hatchCount);
    const hatchStroke = new Float32Array(hatchCount);
    const xDomain = [0, hatchCols];
    const yDomain = [0, hatchRows];
    const paddingInner = hatchGap / (hatchSize + hatchGap);

    for (let row = 0; row < hatchRows; row++) {
        for (let col = 0; col < hatchCols; col++) {
            const i = row * hatchCols + col;
            hx[i] = col;
            hy[i] = row;
            hatchPattern[i] = (i % 10) + 0;
            hatchStroke[i] = 1 + (i % 4);
        }
    }

    const mark = renderer.createMark(rectMark, {
        count: hatchCount,
        channels: {
            x: {
                data: hx,
                type: "u32",
                scale: indexScale({
                    domain: xDomain,
                    paddingInner,
                    paddingOuter: 0,
                    align: 0,
                    band: 0,
                }),
            },
            x2: {
                data: hx,
                type: "u32",
                scale: indexScale({
                    domain: xDomain,
                    paddingInner,
                    paddingOuter: 0,
                    align: 0,
                    band: 1,
                }),
            },
            y: {
                data: hy,
                type: "u32",
                scale: indexScale({
                    domain: yDomain,
                    paddingInner,
                    paddingOuter: 0,
                    align: 0,
                    band: 0,
                }),
            },
            y2: {
                data: hy,
                type: "u32",
                scale: indexScale({
                    domain: yDomain,
                    paddingInner,
                    paddingOuter: 0,
                    align: 0,
                    band: 1,
                }),
            },
            fill: { value: [0.98, 0.98, 0.98, 1.0] },
            stroke: { value: [0.1, 0.1, 0.1, 1.0] },
            strokeOpacity: { value: 1, dynamic: true },
            strokeAlign: { value: 1, type: "u32", dynamic: true },
            cornerRadiusTopLeft: { value: 0, dynamic: true },
            cornerRadiusTopRight: { value: 0, dynamic: true },
            cornerRadiusBottomLeft: { value: 0, dynamic: true },
            cornerRadiusBottomRight: { value: 0, dynamic: true },
            strokeWidth: { data: hatchStroke, type: "f32" },
            hatchPattern: { data: hatchPattern, type: "u32" },
        },
    });

    const { series, scales, values } = mark;
    const updateRanges = () => {
        const xSpan = hatchCols * hatchSize + (hatchCols - 1) * hatchGap;
        const ySpan = hatchRows * hatchSize + (hatchRows - 1) * hatchGap;
        const xRange = [hatchOrigin.x, hatchOrigin.x + xSpan];
        const yRange = [hatchOrigin.y, hatchOrigin.y + ySpan];
        scales.x.setRange(xRange);
        scales.x2.setRange(xRange);
        scales.y.setRange(yRange);
        scales.y2.setRange(yRange);
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    series.replace(
        {
            x: hx,
            y: hy,
            x2: hx,
            y2: hy,
            hatchPattern,
            strokeWidth: hatchStroke,
        },
        hatchCount
    );

    /** @param {{strokeAlign?: number, strokeOpacity?: number, cornerRadius?: number}} next */
    const update = (next) => {
        mark.batchUpdates(() => {
            values.strokeAlign.set(next.strokeAlign ?? 1);
            values.strokeOpacity.set(next.strokeOpacity ?? 1);
            for (const name of [
                "cornerRadiusTopLeft",
                "cornerRadiusTopRight",
                "cornerRadiusBottomLeft",
                "cornerRadiusBottomRight",
            ]) {
                values[name].set(next.cornerRadius ?? 0);
            }
        });
        renderer.render();
    };
    update(options);

    return {
        update,
        cleanup() {
            cleanupResize();
            renderer.destroy();
        },
    };
}
