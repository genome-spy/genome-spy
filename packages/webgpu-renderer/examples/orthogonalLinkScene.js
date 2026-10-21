import { createExampleRenderer, setupResize } from "./utils.js";
import { linkMark } from "../src/marks/link.js";
import { linearScale } from "../src/scales/linear.js";

/**
 * A small retained hierarchy, independent of any visualization grammar or layout transform.
 * @param {HTMLCanvasElement} canvas
 * @param {{shape?: import("../src/index.js").LinkShape, orient?: import("../src/index.js").LinkOrient, size?: number, opacity?: number}} args
 */
export default async function runOrthogonalLinkScene(canvas, args = {}) {
    const renderer = await createExampleRenderer(canvas);
    const sourceDepth = new Float32Array([0.1, 0.1, 0.5, 0.5, 0.6, 0.6]);
    const targetDepth = new Float32Array([0.5, 0.6, 0.9, 0.9, 0.9, 0.9]);
    const sourceRow = new Float32Array([0.5, 0.5, 0.25, 0.25, 0.75, 0.75]);
    const targetRow = new Float32Array([0.25, 0.75, 0.1, 0.4, 0.6, 0.9]);
    const mark = renderer.createMark(linkMark, {
        count: 6,
        linkShape: "orthogonal",
        orient: "horizontal",
        minPickingSize: 8,
        channels: {
            x: { data: sourceDepth, scale: linearScale({ domain: [0, 1] }) },
            x2: { data: targetDepth, scale: linearScale({ domain: [0, 1] }) },
            y: { data: sourceRow, scale: linearScale({ domain: [0, 1] }) },
            y2: { data: targetRow, scale: linearScale({ domain: [0, 1] }) },
            size: { value: 3, dynamic: true },
            opacity: { value: 0.5, dynamic: true },
            color: { value: [0.12, 0.35, 0.65, 1] },
        },
    });
    const cleanupResize = setupResize(canvas, renderer, ({ width, height }) => {
        for (const channel of ["x", "x2"]) {
            mark.scales[channel].setRange([30, Math.max(30, width - 30)]);
        }
        for (const channel of ["y", "y2"]) {
            mark.scales[channel].setRange([30, Math.max(30, height - 30)]);
        }
    });
    /** @param {typeof args} next */
    const update = (next) => {
        const vertical = next.orient == "vertical";
        mark.series.replace(
            {
                x: vertical ? sourceRow : sourceDepth,
                x2: vertical ? targetRow : targetDepth,
                y: vertical ? sourceDepth : sourceRow,
                y2: vertical ? targetDepth : targetRow,
            },
            6
        );
        mark.properties.linkShape.set(next.shape ?? "orthogonal");
        mark.properties.orient.set(next.orient ?? "horizontal");
        mark.values.size.set(next.size ?? 3);
        mark.values.opacity.set(next.opacity ?? 0.5);
        renderer.render();
    };
    update(args);
    return {
        update,
        cleanup: () => {
            cleanupResize();
            renderer.destroy();
        },
    };
}
