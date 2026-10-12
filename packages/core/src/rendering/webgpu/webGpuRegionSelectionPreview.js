import {
    createPointDensityPreview,
    createPointLassoSelection,
} from "@genome-spy/webgpu-renderer/marks/point";
import { RASTER_COORDINATE_OFFSET } from "../renderingConstants.js";

/** Owns GPU lasso tables and optional density images without exposing buffers to views. */
export default class WebGpuRegionSelectionPreview {
    /** @type {{mark: import("../../marks/mark.js").default, name: string, draws: import("@genome-spy/webgpu-renderer").MarkId[], helper: ReturnType<typeof createPointDensityPreview> | ReturnType<typeof createPointLassoSelection>, committed: boolean, active: boolean, cancel: () => void, selection?: import("../../types/selectionTypes.js").RegionSelection} | undefined} */
    #preview;

    /**
     * @param {{renderer: import("@genome-spy/webgpu-renderer").Renderer, marks: ReadonlyMap<import("../../marks/mark.js").default, Pick<import("./webGpuSurface.js").RetainedMark, "handle" | "config">>, getDevicePixelRatio: () => number, onError: (error: Error) => void, syncSelections: () => void}} options
     */
    constructor(options) {
        this.renderer = options.renderer;
        this.marks = options.marks;
        this.getDevicePixelRatio = options.getDevicePixelRatio;
        this.onError = options.onError;
        this.syncSelections = options.syncSelections;
    }

    /** @type {Map<import("../../types/selectionTypes.js").RegionSelection, GPUBuffer>} */
    #tables = new Map();

    /** @param {any} selection */
    getTable(selection) {
        const preview = this.#preview;
        if (
            preview?.active &&
            preview.mark.unitView.paramRuntime.findValue(preview.name) ===
                selection
        )
            return preview.helper.table;
        return this.#tables.get(selection);
    }

    destroy() {
        for (const table of this.#tables.values()) table.destroy();
        this.#tables.clear();
    }

    /** @param {import("../../marks/mark.js").default} mark */
    selectionChanged(mark) {
        if (this.#preview?.mark !== mark) this.invalidate();
    }

    /**
     * @param {import("@genome-spy/webgpu-renderer").RenderItem[]} items
     * @param {GPUColor} [clearColor]
     * @returns {boolean} Whether the cached scene owns this frame.
     */
    render(items, clearColor) {
        for (const [selection, table] of this.#tables) {
            let used = false;
            for (const [mark, retained] of this.marks) {
                for (const name in retained.handle.selections ?? {})
                    used ||=
                        mark.unitView.paramRuntime.findValue(name) ===
                        selection;
            }
            if (!used) {
                table.destroy();
                this.#tables.delete(selection);
            }
        }
        const preview = this.#preview;
        if (!preview || !("render" in preview.helper)) return false;
        let index = 0;
        let valid =
            !clearColor ||
            ("r" in clearColor &&
                clearColor.r === 1 &&
                clearColor.g === 1 &&
                clearColor.b === 1 &&
                clearColor.a === 1);
        for (const item of iterateRenderItems(items)) {
            if ("mark" in item && item.mark.markId !== preview.draws[index++])
                valid = false;
            if (
                "items" in item &&
                item.opacity !== undefined &&
                item.opacity !== 1
            )
                valid = false;
        }
        if (!valid || index !== preview.draws.length) {
            this.invalidate();
            return false;
        }
        if (!preview.active) {
            const selection = preview.mark.unitView.paramRuntime.findValue(
                preview.name
            );
            if (preview.selection !== selection) {
                preview.selection = selection;
                this.#report(preview.helper.renderSelection(preview.name));
            } else preview.helper.render();
        }
        return true;
    }

    /** @param {Promise<void> | void} update */
    #report(update) {
        const preview = this.#preview;
        void Promise.resolve(update).catch((error) => {
            if (this.#preview !== preview) return;
            this.invalidate();
            this.onError(error);
        });
    }

    invalidate() {
        const preview = this.#preview;
        this.#preview = undefined;
        if (preview) {
            this.syncSelections();
            preview.helper.destroy();
            if (preview.active) preview.cancel();
        }
    }

    /**
     * @param {import("../../view/unitView.js").default} view
     * @param {string} name
     * @param {() => void} cancel
     * @param {import("@genome-spy/webgpu-renderer").RenderItem[]} items
     * @param {GPUColorDict} background
     * @param {boolean} [density]
     */
    create(view, name, cancel, items, background, density = true) {
        const mark = view.mark;
        if (
            this.#preview?.mark !== mark ||
            this.#preview.name !== name ||
            this.#preview.committed
        )
            this.invalidate();
        if (!this.#preview) {
            const retained = this.marks.get(mark);
            if (!retained)
                throw new Error(
                    "Density preview requires a rendered point mark."
                );
            let helper;
            /** @type {import("@genome-spy/webgpu-renderer").MarkId[]} */
            const draws = [];
            if (density) {
                const channels = retained.config.channels;
                const fill = channels.fill;
                const condition = fill.conditions?.[0];
                /** @param {any} value */
                const read = (value) =>
                    typeof value === "function" ? value() : value;
                const neutral = read(fill.value);
                const highlight = read(condition?.channel?.value);
                if (
                    background.r !== 1 ||
                    background.g !== 1 ||
                    background.b !== 1 ||
                    background.a !== 1 ||
                    fill.conditions?.length !== 1 ||
                    condition.when.selection !== name ||
                    condition.when.type !== "multi" ||
                    condition.when.empty !== false ||
                    !Array.isArray(neutral) ||
                    !Array.isArray(highlight) ||
                    neutral[3] !== 1 ||
                    highlight[3] !== 1 ||
                    read(channels.strokeWidth.value) !== 0 ||
                    retained.config.shape !== "circle" ||
                    read(channels.gradientStrength.value) !== 0 ||
                    retained.config.order ||
                    retained.config.visibility ||
                    Object.entries(channels).some(
                        ([channel, config]) =>
                            !["x", "y", "uniqueId", "fill"].includes(channel) &&
                            (config.data || config.scale || config.conditions)
                    )
                )
                    throw new Error(
                        "Density preview requires uniform unstroked circles, one constant lasso fill condition with empty:false, and an opaque white background."
                    );
                const coords = view.coords;
                let overlaps = false;
                for (const item of iterateRenderItems(items)) {
                    if ("mark" in item) draws.push(item.mark.markId);
                    if (
                        "items" in item &&
                        item.opacity !== undefined &&
                        item.opacity !== 1
                    )
                        overlaps = true;
                }
                const others = new Set(
                    draws.filter((id) => id !== retained.handle.markId)
                );
                for (const [other, resource] of this.marks) {
                    if (!others.delete(resource.handle.markId)) continue;
                    for (const rect of other.unitView.facetCoords.values()) {
                        overlaps ||=
                            rect.x < coords.x + coords.width &&
                            rect.y < coords.y + coords.height &&
                            rect.x + rect.width > coords.x &&
                            rect.y + rect.height > coords.y;
                    }
                }
                if (overlaps || others.size)
                    throw new Error(
                        "Density preview does not support overlaid marks or view/group opacity."
                    );
                const dpr = this.getDevicePixelRatio();
                const viewport =
                    /** @type {[number, number, number, number]} */ ([
                        Math.floor(coords.x * dpr),
                        Math.floor(coords.y * dpr),
                        Math.floor(coords.width * dpr),
                        Math.floor(coords.height * dpr),
                    ]);
                const [x, y, width, height] = viewport.map(
                    (value) => value / dpr
                );
                helper = createPointDensityPreview(
                    this.renderer,
                    retained.handle,
                    {
                        neutral,
                        highlight,
                        // Captured centers and pointer traces use canvas logical pixels.
                        view: [x, y + height, x + width, y],
                        viewport,
                        // Eligibility includes raster alignment without shifting physical pixel bins.
                        bounds: [
                            coords.x + RASTER_COORDINATE_OFFSET,
                            coords.y + RASTER_COORDINATE_OFFSET,
                            coords.x + coords.width + RASTER_COORDINATE_OFFSET,
                            coords.y + coords.height + RASTER_COORDINATE_OFFSET,
                        ],
                        draw: () =>
                            this.renderer.render({
                                items,
                                clearColor: background,
                            }),
                    }
                );
            } else {
                helper = createPointLassoSelection(
                    this.renderer,
                    retained.handle
                );
            }
            this.#preview = {
                mark,
                name,
                draws,
                helper,
                active: false,
                committed: false,
                cancel,
            };
        }
        const preview = this.#preview;
        preview.cancel = cancel;
        return {
            /** @param {ReadonlyArray<readonly [number,number]>} points */
            update: (points) => {
                if (this.#preview !== preview) return;
                if (!preview.active) {
                    preview.active = true;
                    this.syncSelections();
                }
                preview.selection = undefined;
                // GPU point ranges include raster alignment; CPU selection centers do not.
                this.#report(
                    points.length < 3 && !("render" in preview.helper)
                        ? preview.helper.clear()
                        : preview.helper.update(
                              points
                                  .filter(
                                      (_, i) =>
                                          i %
                                              Math.max(
                                                  1,
                                                  Math.ceil(points.length / 511)
                                              ) ===
                                              0 || i === points.length - 1
                                  )
                                  .map(([x, y]) => [
                                      x + RASTER_COORDINATE_OFFSET,
                                      y + RASTER_COORDINATE_OFFSET,
                                  ])
                          )
                );
            },
            readIds: async () => {
                try {
                    return await preview.helper.readIds();
                } catch (error) {
                    if (this.#preview === preview) this.onError(error);
                    throw error;
                }
            },
            /** @param {import("../../types/selectionTypes.js").RegionSelection} selection */
            commit: (selection) => {
                if (this.#preview !== preview)
                    throw new Error("Lasso snapshot is no longer live.");
                this.#tables.set(selection, preview.helper.takeTable());
                preview.selection = selection;
                preview.committed = true;
            },
            stop: () => {
                if (this.#preview !== preview) return;
                preview.active = false;
                if ("stop" in preview.helper) preview.helper.stop();
                this.syncSelections();
            },
        };
    }
}

/** @param {Iterable<import("@genome-spy/webgpu-renderer").RenderItem>} items
 * @returns {Generator<import("@genome-spy/webgpu-renderer").RenderItem>} */
function* iterateRenderItems(items) {
    for (const item of items) {
        yield item;
        if ("items" in item) yield* iterateRenderItems(item.items);
    }
}
