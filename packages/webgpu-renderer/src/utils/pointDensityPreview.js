import { createPointLassoSelection } from "./pointLassoSelection.js";
import { LassoImage } from "./lassoImage.js";
import { SELECTION_BUFFER_PREFIX } from "../wgsl/prefixes.js";
import PointProgram from "../marks/programs/pointProgram.js";

/**
 * Cache uniform point appearance once and update selection density without geometry.
 * The host owns scene invalidation; later mark updates do not change the snapshot.
 * @param {import("../renderer.js").Renderer} renderer
 * @param {import("../index.d.ts").MarkHandle} mark
 * @param {{draw: () => void, view: readonly [number,number,number,number], viewport: readonly [number,number,number,number], bounds?: readonly [number,number,number,number], neutral: readonly number[], highlight: readonly number[]}} options
 */
export function createPointDensityPreview(renderer, mark, options) {
    const fill = mark.values.fill?.conditions?.[0];
    if (!fill)
        throw new Error(
            "Density preview requires a constant conditional fill slot."
        );
    const lasso = createPointLassoSelection(renderer, mark);
    /** @type {LassoImage} */
    let image;
    try {
        image = new LassoImage(renderer.canvas, lasso, {
            ...options,
            alphaMode: renderer.alphaMode,
            format: renderer.format,
        });
        fill.set(Array.from(options.neutral));
        try {
            image.capture(
                options.draw,
                options.view,
                options.viewport,
                options.bounds
            );
        } finally {
            fill.set(Array.from(options.highlight));
        }
    } catch (error) {
        image?.destroy();
        lasso.destroy();
        throw error;
    }
    /** @type {{polygon: ReadonlyArray<readonly [number,number]>} | {selection: string} | undefined} */
    let pending;
    let busy = false;
    let destroyed = false;
    let running = Promise.resolve();
    const drain = async () => {
        busy = true;
        try {
            while (pending && !destroyed) {
                const update = pending;
                pending = undefined;
                if ("polygon" in update) {
                    if (update.polygon.length >= 3)
                        lasso.update(update.polygon);
                    else lasso.clear();
                } else {
                    const program = renderer._marks.get(mark.markId);
                    if (!(program instanceof PointProgram))
                        throw new Error(
                            "Density preview source point mark is no longer live."
                        );
                    const table = program._extraBuffers.get(
                        SELECTION_BUFFER_PREFIX + update.selection
                    );
                    if (!table)
                        throw new Error(
                            "Density preview requires a multi selection on its source mark."
                        );
                    lasso.updateDensity(table);
                }
                image.render();
                await renderer.device.queue.onSubmittedWorkDone();
            }
        } finally {
            busy = false;
        }
    };
    /** @param {NonNullable<typeof pending>} update */
    const request = (update) => {
        if (destroyed) throw new Error("Density preview is destroyed.");
        pending = update;
        if (!busy) running = drain();
        return running;
    };
    return {
        get table() {
            return lasso.table;
        },
        async readIds() {
            await running;
            if (destroyed) throw new Error("Density preview is destroyed.");
            return lasso.readIds();
        },
        takeTable: () => lasso.takeTable(),
        /** Approximate freehand paths within the compute utility's vertex budget.
         * @param {ReadonlyArray<readonly [number,number]>} polygon */
        update(polygon) {
            const stride = Math.max(1, Math.ceil(polygon.length / 511));
            return request({
                polygon: polygon.filter(
                    (_, i) => i % stride === 0 || i === polygon.length - 1
                ),
            });
        },
        /** Use an existing authoritative mark selection without reading IDs back.
         * @param {string} selection */
        renderSelection(selection) {
            return request({ selection });
        },
        stop() {
            pending = undefined;
        },
        render() {
            if (destroyed) throw new Error("Density preview is destroyed.");
            image.render();
        },
        destroy() {
            destroyed = true;
            pending = undefined;
            image.destroy();
            lasso.destroy();
        },
    };
}
