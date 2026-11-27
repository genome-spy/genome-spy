import { rasterMark } from "../src/marks/raster.js";
import { linearScale } from "../src/scales/linear.js";
import { thresholdScale } from "../src/scales/threshold.js";
import { createExampleRenderer, setupResize } from "./utils.js";

/** @param {number} columns */
function rasterData(columns) {
    const rows = 12;
    const size = columns * rows;
    const signal = new Float32Array(size * 2);
    const quality = new Float32Array(signal.length);

    for (let i = 0; i < size; i++) {
        const x = (i % columns) / columns;
        const y = Math.floor(i / columns) / rows;
        signal[i] = 0.2 + 0.8 * Math.exp(-30 * (x - y) ** 2);
        signal[size + i] = -0.2 - 0.8 * Math.exp(-30 * (x + y - 1) ** 2);
        quality[i] = quality[size + i] = 0.3 + 0.4 * Math.sin(Math.PI * y);
    }
    return {
        tiles: {
            x0: new Float32Array([0.05, 0.28]),
            x1: new Float32Array([0.72, 0.95]),
            y0: new Float32Array([0.1, 0.22]),
            y1: new Float32Array([0.78, 0.9]),
            columns: new Uint32Array([columns, columns]),
            rows: new Uint32Array([rows, rows]),
            offsets: new Uint32Array([0, size]),
        },
        cells: { signal, quality },
    };
}

/**
 * Click to replace both grids at a different resolution and promote the
 * high-signal cells in the overlapping region.
 * @param {HTMLCanvasElement} canvas
 */
export default async function runRasterScene(canvas) {
    const renderer = await createExampleRenderer(canvas);
    /** @type {import("../src/index.js").SelectionPredicate} */
    const strongSignal = {
        selection: "signalBrush",
        type: "interval",
        projections: [{ component: "signal", input: "signal" }],
        empty: false,
    };
    /** @type {import("../src/index.js").SelectionPredicate} */
    const highlighted = {
        all: [
            strongSignal,
            {
                selection: "region",
                type: "interval",
                projections: [
                    { component: "x", position: "x" },
                    { component: "y", position: "y" },
                ],
                empty: false,
            },
        ],
    };
    const mark = renderer.createMark(rasterMark, {
        data: rasterData(16),
        position: {
            x: { scale: linearScale({ domain: [0, 1], range: [0, 1] }) },
            y: { scale: linearScale({ domain: [0, 1], range: [0, 1] }) },
        },
        channels: {
            fill: {
                input: "signal",
                scale: thresholdScale({
                    domain: [-0.6, 0, 0.6],
                    range: [
                        [0.09, 0.35, 0.68, 1],
                        [0.55, 0.76, 0.93, 1],
                        [0.99, 0.76, 0.38, 1],
                        [0.76, 0.24, 0.11, 1],
                    ],
                }),
            },
            opacity: {
                input: "quality",
                conditions: [{ when: highlighted, value: 0.94 }],
            },
        },
        order: { when: highlighted, matching: "last" },
    });

    const frame = () => ({ draws: [{ mark }] });
    const cleanupResize = setupResize(
        canvas,
        renderer,
        ({ width, height }) => {
            mark.batchUpdates(() => {
                mark.scales.x.setRange([0, width]);
                mark.scales.y.setRange([0, height]);
            });
        },
        frame
    );
    let selected = false;
    const replace = () => {
        selected = !selected;
        mark.batchUpdates(() => {
            mark.series.replace(rasterData(selected ? 8 : 16));
            mark.selections.signalBrush.set(
                selected ? { signal: [0.6, 1.01] } : {}
            );
            mark.selections.region.set(
                selected ? { x: [0.28, 0.72], y: [0.22, 0.78] } : {}
            );
        });
        renderer.render(frame());
    };
    canvas.addEventListener("click", replace);

    return () => {
        canvas.removeEventListener("click", replace);
        cleanupResize();
        renderer.destroy();
    };
}
