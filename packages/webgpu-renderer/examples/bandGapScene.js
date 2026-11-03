import { createExampleRenderer, setupResize } from "./utils.js";
import { rectMark } from "../src/marks/rect.js";
import { bandScale } from "../src/scales/band.js";

/**
 * A categorical matrix with retained sparse IDs and pixel-sized group gaps.
 * Reordering and viewport navigation retain the input series and category IDs.
 * @param {HTMLCanvasElement} canvas
 * @param {{gapWidth?: number, reverse?: boolean, zoom?: number, pan?: number}} [options]
 * @returns {Promise<{cleanup: () => void, update: (next: {gapWidth?: number, reverse?: boolean, zoom?: number, pan?: number}) => void}>}
 */
export default async function runBandGapScene(
    canvas,
    { gapWidth = 12, reverse = false, zoom = 1, pan = 0 } = {}
) {
    const renderer = await createExampleRenderer(canvas);
    const columns = [200, 5, 900, 11];
    const rows = [50, 2, 300, 4];
    const x = new Uint32Array(
        Array.from({ length: 16 }, (_, i) => columns[i % 4])
    );
    const y = new Uint32Array(
        Array.from({ length: 16 }, (_, i) => rows[Math.floor(i / 4)])
    );
    /** @param {Uint32Array} data @param {number[]} domain @param {number} band */
    const endpoint = (data, domain, band) => ({
        data,
        type: "u32",
        scale: bandScale({
            domain,
            range: [0, 500],
            band,
            paddingInner: 0.08,
            gapEnabled: true,
            gapPositions: [2],
            gapWidth,
        }),
    });
    const fill = new Float32Array(
        Array.from({ length: 16 }, (_, i) => [
            (i % 4) / 4 + 0.2,
            Math.floor(i / 4) / 4 + 0.2,
            0.65,
            1,
        ]).flat()
    );
    const handle = renderer.createMark(rectMark, {
        count: 16,
        channels: {
            x: endpoint(x, columns, 0),
            x2: endpoint(x, columns, 1),
            y: endpoint(y, rows, 0),
            y2: endpoint(y, rows, 1),
            fill: { data: fill, components: 4 },
            strokeOpacity: { value: 0 },
        },
    });
    const cleanupResize = setupResize(canvas, renderer, ({ width, height }) => {
        handle.batchUpdates(() => {
            for (const axis of ["x", "x2"])
                handle.scales[axis].setRange([24, width - 24]);
            for (const axis of ["y", "y2"])
                handle.scales[axis].setRange([height - 24, 24]);
        });
    });
    const update = (
        /** @type {{gapWidth?: number, reverse?: boolean, zoom?: number, pan?: number}} */ next
    ) => {
        gapWidth = next.gapWidth ?? gapWidth;
        reverse = next.reverse ?? reverse;
        zoom = next.zoom ?? zoom;
        pan = next.pan ?? pan;
        const span = columns.length / zoom;
        const start = (columns.length - span) * pan;
        handle.batchUpdates(() => {
            for (const axis of ["x", "x2", "y", "y2"])
                handle.scales[axis].setGapWidth(gapWidth);
            for (const axis of ["x", "x2"]) {
                handle.scales[axis].setDomain(
                    reverse ? columns.toReversed() : columns
                );
                handle.scales[axis].setViewport(
                    zoom === 1 ? null : { interval: [start, start + span] }
                );
            }
        });
        renderer.render();
    };
    update({ gapWidth, reverse, zoom, pan });
    return {
        update,
        cleanup() {
            cleanupResize();
            renderer.destroy();
        },
    };
}
