import { createExampleRenderer, setupResize } from "./utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runHatchScene(canvas) {
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

    const hatchMarkId = renderer.createMark("rect", {
        count: hatchCount,
        channels: {
            x: {
                data: hx,
                type: "u32",
                scale: {
                    type: "index",
                    domain: xDomain,
                    paddingInner,
                    paddingOuter: 0,
                    align: 0,
                    band: 0,
                },
            },
            x2: {
                data: hx,
                type: "u32",
                scale: {
                    type: "index",
                    domain: xDomain,
                    paddingInner,
                    paddingOuter: 0,
                    align: 0,
                    band: 1,
                },
            },
            y: {
                data: hy,
                type: "u32",
                scale: {
                    type: "index",
                    domain: yDomain,
                    paddingInner,
                    paddingOuter: 0,
                    align: 0,
                    band: 0,
                },
            },
            y2: {
                data: hy,
                type: "u32",
                scale: {
                    type: "index",
                    domain: yDomain,
                    paddingInner,
                    paddingOuter: 0,
                    align: 0,
                    band: 1,
                },
            },
            fill: { value: [0.98, 0.98, 0.98, 1.0] },
            stroke: { value: [0.1, 0.1, 0.1, 1.0] },
            strokeOpacity: { value: 1.0 },
            strokeWidth: { data: hatchStroke, type: "f32" },
            hatchPattern: { data: hatchPattern, type: "u32" },
        },
    });

    const updateRanges = () => {
        const xSpan = hatchCols * hatchSize + (hatchCols - 1) * hatchGap;
        const ySpan = hatchRows * hatchSize + (hatchRows - 1) * hatchGap;
        const xRange = [hatchOrigin.x, hatchOrigin.x + xSpan];
        const yRange = [hatchOrigin.y, hatchOrigin.y + ySpan];
        renderer.updateScaleRanges(hatchMarkId, {
            x: xRange,
            x2: xRange,
            y: yRange,
            y2: yRange,
        });
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    renderer.updateSeries(
        hatchMarkId,
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

    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroyMark(hatchMarkId);
    };
}
