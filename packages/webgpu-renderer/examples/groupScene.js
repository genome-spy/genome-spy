import { rectMark } from "../src/marks/rect.js";
import { identityScale } from "../src/scales/identity.js";
import { createExampleRenderer, setupResize } from "./utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{opacity?: number, multisample?: boolean}} [args]
 */
export default async function runGroupScene(canvas, args = {}) {
    const renderer = await createExampleRenderer(canvas);
    const createRect = (x, y, x2, y2, fill) =>
        renderer.createMark(rectMark, {
            count: 1,
            channels: {
                x: { value: x, scale: identityScale() },
                y: { value: y, scale: identityScale() },
                x2: { value: x2, scale: identityScale() },
                y2: { value: y2, scale: identityScale() },
                fill: { value: fill },
                strokeWidth: { value: 0 },
            },
        });
    const first = createRect(80, 80, 320, 260, [0.1, 0.45, 0.9, 1]);
    const second = createRect(200, 150, 440, 330, [0.95, 0.25, 0.15, 1]);
    let bounds = { x: 0, y: 0, width: 1, height: 1 };

    const frame = () => ({
        items: [
            {
                bounds,
                opacity: args.opacity ?? 0.65,
                sampleCount: args.multisample === false ? 1 : 4,
                items: [{ mark: first }, { mark: second }],
            },
        ],
    });
    const cleanupResize = setupResize(
        canvas,
        renderer,
        ({ width, height }) => {
            bounds = { x: 0, y: 0, width, height };
        },
        frame
    );

    return {
        update(next) {
            args = next;
            renderer.render(frame());
        },
        cleanup() {
            cleanupResize();
            renderer.destroy();
        },
    };
}
