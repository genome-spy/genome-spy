import { createRenderer } from "@genome-spy/webgpu-renderer";

import CanvasSizeHelper from "../canvasSizeHelper.js";
import PlacementSource from "../../view/layout/placementSource.js";

/**
 * Owns the live WebGPU canvas and the low-level renderer used by the PoC.
 */
export default class WebGpuSurface {
    /** @type {CanvasSizeHelper} */
    #sizeHelper;

    /** @type {import("@genome-spy/webgpu-renderer").Renderer | undefined} */
    #renderer;

    /** @type {Map<import("../../marks/mark.js").default, RetainedMark>} */
    #marks = new Map();

    /** @type {WeakMap<import("../../view/layout/placementSource.js").default, {set: import("@genome-spy/webgpu-renderer").PlacementSetHandle, topologyRevision: number, geometryRevision: number}>} */
    #placementSets = new WeakMap();

    /** @type {Map<import("../../marks/mark.js").default, PlacementSource>} */
    #occurrencePlacementSources = new Map();

    /** @type {WeakSet<import("../../marks/mark.js").default>} */
    #registeredMarkOwners = new WeakSet();

    /** @type {import("@genome-spy/webgpu-renderer").DrawCommand[]} */
    #frameDraws = [];

    /** @type {import("@genome-spy/webgpu-renderer").DrawCommand[]} */
    #pickingDraws = [];

    /** @type {{logicalWidth: number, logicalHeight: number, physicalWidth: number, physicalHeight: number} | undefined} */
    #appliedSize;

    /**
     * @param {import("../renderingBackend.js").RenderingBackendOptions} options
     */
    constructor(options) {
        this.options = options;
        this.canvas = document.createElement("canvas");
        options.container.appendChild(this.canvas);

        this.#sizeHelper = new CanvasSizeHelper(
            options.container,
            this.canvas,
            options.sizeSource,
            () => {
                if (this.#adjustCanvas()) {
                    options.onCanvasResize();
                }
            }
        );
        this.#adjustCanvas();
    }

    async initialize() {
        this.#renderer = await createRenderer(this.canvas, {
            onInvalidate: () => {
                if (this.#renderer) {
                    this.options.onRenderInvalidated?.();
                }
            },
        });
        this.#updateRendererGlobals();
    }

    invalidateSize() {
        this.#sizeHelper.invalidate();
        return this.#adjustCanvas();
    }

    #adjustCanvas() {
        const logicalSize = this.getLogicalCanvasSize();
        const physicalSize =
            this.#sizeHelper.getPhysicalCanvasSize(logicalSize);
        if (
            this.#appliedSize?.logicalWidth == logicalSize.width &&
            this.#appliedSize.logicalHeight == logicalSize.height &&
            this.#appliedSize.physicalWidth == physicalSize.width &&
            this.#appliedSize.physicalHeight == physicalSize.height
        ) {
            return false;
        }

        this.canvas.style.width = `${logicalSize.width}px`;
        this.canvas.style.height = `${logicalSize.height}px`;
        this.canvas.width = physicalSize.width;
        this.canvas.height = physicalSize.height;
        this.#appliedSize = {
            logicalWidth: logicalSize.width,
            logicalHeight: logicalSize.height,
            physicalWidth: physicalSize.width,
            physicalHeight: physicalSize.height,
        };
        this.#updateRendererGlobals();
        return true;
    }

    #updateRendererGlobals() {
        if (!this.#renderer || !this.#appliedSize) {
            return;
        }
        if (
            this.#appliedSize.logicalWidth <= 0 ||
            this.#appliedSize.logicalHeight <= 0
        ) {
            // Auto-sized views can expose a transient zero-sized canvas before
            // the first layout pass establishes their requested dimensions.
            return;
        }
        this.#renderer.updateGlobals({
            width: this.#appliedSize.logicalWidth,
            height: this.#appliedSize.logicalHeight,
            dpr: this.getDevicePixelRatio(),
        });
    }

    getLogicalCanvasSize() {
        return this.#sizeHelper.getLogicalCanvasSize();
    }

    getDevicePixelRatio() {
        return this.#sizeHelper.getDevicePixelRatio();
    }

    /**
     * Starts a new ordered frame without releasing retained marks.
     */
    beginFrame() {
        this.#frameDraws.length = 0;
        this.#pickingDraws.length = 0;
    }

    /** Starts collecting the next on-demand pick frame. */
    beginPickingFrame() {
        this.#pickingDraws.length = 0;
    }

    /**
     * Returns a renderer-owned resource derived from a Core placement source.
     * Replacement preserves the public handle and mark pipeline identity.
     *
     * @param {import("../../view/layout/placementSource.js").default} source
     */
    getPlacementSet(source) {
        if (!this.#renderer) {
            throw new Error("The WebGPU surface has not been initialized.");
        }

        const snapshot = source.getSnapshot();
        const cached = this.#placementSets.get(source);
        if (!cached) {
            const set = this.#renderer.createPlacementSet({
                rectangles: snapshot.rectangles,
            });
            const entry = {
                set,
                topologyRevision: snapshot.topology.revision,
                geometryRevision: snapshot.geometryRevision,
            };
            this.#placementSets.set(source, entry);
            source.onDispose(() => {
                const current = this.#placementSets.get(source);
                if (current) {
                    current.set.destroy();
                    this.#placementSets.delete(source);
                }
            });
            return set;
        }

        if (
            cached.topologyRevision !== snapshot.topology.revision ||
            cached.geometryRevision !== snapshot.geometryRevision
        ) {
            cached.set.replace({ rectangles: snapshot.rectangles });
            cached.topologyRevision = snapshot.topology.revision;
            cached.geometryRevision = snapshot.geometryRevision;
        }
        return cached.set;
    }

    /**
     * Publishes adapter-owned placement for repeated ordinary occurrences.
     * The source follows logical mark ownership and survives empty frames.
     *
     * @param {import("../../marks/mark.js").default} mark
     * @param {Float32Array} rectangles
     */
    updateOccurrencePlacements(mark, rectangles) {
        this.#registerMarkOwner(mark);
        let source = this.#occurrencePlacementSources.get(mark);
        if (!source) {
            source = new PlacementSource();
            source.replaceTopology(
                Array.from({ length: rectangles.length / 4 }, (_, index) => [
                    index,
                ]),
                rectangles
            );
            this.#occurrencePlacementSources.set(mark, source);
        } else {
            const snapshot = source.getSnapshot();
            if (snapshot.rectangles.length !== rectangles.length) {
                source.replaceTopology(
                    Array.from(
                        { length: rectangles.length / 4 },
                        (_, index) => [index]
                    ),
                    rectangles
                );
            } else if (!equalFloat32Arrays(snapshot.rectangles, rectangles)) {
                source.replaceGeometry(rectangles);
            }
        }
        return source;
    }

    /**
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} definition
     * @param {any} config
     * @param {{viewport?: import("@genome-spy/webgpu-renderer").DrawRect, scissor?: import("@genome-spy/webgpu-renderer").DrawRect, visibleRange?: import("@genome-spy/webgpu-renderer").DrawVisibleRange, placement?: {source: import("../../view/layout/placementSource.js").default, index?: number, clipToPlacement?: "x" | "y" | "xy"}, firstInstance?: number, instanceCount?: number, picking?: boolean}} [options]
     */
    useMark(mark, definition, config, options = {}) {
        if (!this.#renderer) {
            throw new Error("The WebGPU surface has not been initialized.");
        }

        this.#registerMarkOwner(mark);
        let retained = this.#marks.get(mark);
        if (!retained || retained.definition !== definition) {
            if (retained) {
                this.#renderer.destroyMark(retained.handle.markId);
            }
            const handle = this.#renderer.createMark(
                definition,
                makeRetainableConfig(config)
            );
            retained = {
                definition,
                handle,
                series: collectSeries(config),
                count: config.count,
                selections: new Map(),
                dynamicValues: new Map(
                    Object.entries(config.dynamicValues ?? {}).map(
                        ([name, value]) => [name, value.value]
                    )
                ),
                scalarSlots: new Map(
                    Object.entries(config.scalarSlots ?? {}).map(
                        ([name, value]) => [name, value.value]
                    )
                ),
            };
            this.#marks.set(mark, retained);
        } else {
            updateRetainedMark(retained, config);
        }
        updateRetainedExtraValues(retained, config);
        updateRetainedScalarSlots(retained, config);
        updateRetainedSelections(retained, mark);

        const draw = {
            mark: retained.handle,
            ...(options.viewport
                ? { viewport: toDrawRect(options.viewport) }
                : {}),
            ...(options.scissor ? { scissor: options.scissor } : {}),
            ...(options.visibleRange
                ? { visibleRange: options.visibleRange }
                : {}),
            ...(options.firstInstance !== undefined
                ? { firstInstance: options.firstInstance }
                : {}),
            ...(options.instanceCount !== undefined
                ? { instanceCount: options.instanceCount }
                : {}),
            ...(options.placement
                ? {
                      placement: {
                          set: this.getPlacementSet(options.placement.source),
                          ...(options.placement.index !== undefined
                              ? { index: options.placement.index }
                              : {}),
                          ...(options.placement.clipToPlacement
                              ? {
                                    clipToPlacement:
                                        options.placement.clipToPlacement,
                                }
                              : {}),
                      },
                  }
                : {}),
        };
        (options.picking ? this.#pickingDraws : this.#frameDraws).push(draw);
    }

    /**
     * @param {GPUColor} [clearColor]
     */
    render(clearColor) {
        if (!this.#renderer) {
            throw new Error("The WebGPU surface has not been initialized.");
        }
        this.#renderer.render({
            draws: this.#frameDraws,
            ...(clearColor ? { clearColor } : {}),
        });
    }

    renderPicking() {
        if (!this.#renderer) {
            throw new Error("The WebGPU surface has not been initialized.");
        }
        this.#renderer.renderPicking({ draws: this.#pickingDraws });
    }

    /**
     * Reads a unique id in logical canvas coordinates.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Promise<number | null>}
     */
    pick(x, y) {
        if (!this.#renderer) {
            throw new Error("The WebGPU surface has not been initialized.");
        }
        return this.#renderer.pick(x, y);
    }

    finalize() {
        for (const source of this.#occurrencePlacementSources.values()) {
            source.dispose();
        }
        this.#renderer?.destroy();
        this.#renderer = undefined;
        this.#marks.clear();
        this.#placementSets = new WeakMap();
        this.#occurrencePlacementSources.clear();
        this.#registeredMarkOwners = new WeakSet();
        this.#frameDraws.length = 0;
        this.#pickingDraws.length = 0;
        this.#sizeHelper.finalize();
        this.canvas.remove();
    }

    /** @param {import("../../marks/mark.js").default} mark */
    #registerMarkOwner(mark) {
        if (this.#registeredMarkOwners.has(mark)) {
            return;
        }
        this.#registeredMarkOwners.add(mark);
        mark.unitView?.registerDisposer?.(() => this.#releaseMark(mark));
    }

    /** @param {import("../../marks/mark.js").default} mark */
    #releaseMark(mark) {
        const retained = this.#marks.get(mark);
        if (retained) {
            this.#renderer?.destroyMark(retained.handle.markId);
            this.#marks.delete(mark);
        }
        const source = this.#occurrencePlacementSources.get(mark);
        if (source) {
            source.dispose();
            this.#occurrencePlacementSources.delete(mark);
        }
    }
}

/** @param {Float32Array} first @param {Float32Array} second */
function equalFloat32Arrays(first, second) {
    if (first.length !== second.length) {
        return false;
    }
    for (let index = 0; index < first.length; index++) {
        if (first[index] !== second[index]) {
            return false;
        }
    }
    return true;
}

/** @param {import("@genome-spy/webgpu-renderer").DrawRect} rect */
function toDrawRect(rect) {
    return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    };
}

/**
 * Makes numeric value channels updateable without changing their pipeline
 * shape. Text values remain renderer-owned because they require glyph layout.
 *
 * @param {any} config
 */
function makeRetainableConfig(config) {
    return {
        ...config,
        channels: Object.fromEntries(
            Object.entries(config.channels).map(([name, channel]) => [
                name,
                channel.value !== undefined && typeof channel.value != "string"
                    ? { ...channel, dynamic: true }
                    : channel,
            ])
        ),
    };
}

/**
 * Updates the resource slots exposed by the renderer's public mark handle.
 * The PoC grammar keeps channel structure stable after initialization.
 *
 * @param {RetainedMark} retained
 * @param {any} config
 */
function updateRetainedMark(retained, config) {
    for (const [name, channel] of Object.entries(config.channels)) {
        updateChannelSlots(
            retained.handle.scales[name]?.default,
            retained.handle.values[name]?.default,
            channel
        );

        for (const condition of channel.conditions ?? []) {
            if (!condition.channel) {
                continue;
            }
            updateChannelSlots(
                retained.handle.scales[name]?.conditions?.[
                    condition.when.selection
                ],
                retained.handle.values[name]?.conditions?.[
                    condition.when.selection
                ],
                condition.channel
            );
        }
    }

    if (hasSeriesChanges(retained, config)) {
        retained.series = collectSeries(config);
        retained.count = config.count;
        retained.handle.series.replace(retained.series, retained.count);
    }
}

/**
 * Updates one default or conditional scale/value pair without recreating the
 * retained mark. The renderer owns the actual slot-resource details.
 *
 * @param {import("@genome-spy/webgpu-renderer").ScaleSlotHandle | undefined} scaleSlot
 * @param {import("@genome-spy/webgpu-renderer").ValueSlotHandle | undefined} valueSlot
 * @param {any} channel
 */
function updateChannelSlots(scaleSlot, valueSlot, channel) {
    if (scaleSlot && channel.scale) {
        if (channel.scale.domain) {
            scaleSlot.setDomain(channel.scale.domain);
        }
        if (channel.scale.range) {
            scaleSlot.setRange(channel.scale.range);
        }
    }

    if (valueSlot && channel.value !== undefined) {
        valueSlot.set(channel.value);
    }
}

/**
 * Updates mark-program uniforms exposed as retained extra-value slots.
 *
 * @param {RetainedMark} retained
 * @param {any} config
 */
function updateRetainedExtraValues(retained, config) {
    for (const [name, dynamic] of Object.entries(config.dynamicValues ?? {})) {
        const slot = retained.handle.extraValues?.[name];
        if (
            !slot ||
            valuesEqual(retained.dynamicValues.get(name), dynamic.value)
        ) {
            continue;
        }
        slot.set(dynamic.value);
        retained.dynamicValues.set(name, dynamic.value);
    }
}

/**
 * Updates retained predicate scalar slots without rebuilding the mark.
 *
 * @param {RetainedMark} retained
 * @param {any} config
 */
function updateRetainedScalarSlots(retained, config) {
    for (const [name, scalar] of Object.entries(config.scalarSlots ?? {})) {
        const slot = retained.handle.scalarSlots?.[name];
        if (
            !slot ||
            valuesEqual(retained.scalarSlots.get(name), scalar.value)
        ) {
            continue;
        }
        slot.set(scalar.value);
        retained.scalarSlots.set(name, scalar.value);
    }
}

/**
 * @param {number | number[] | undefined} previous
 * @param {number | number[]} next
 */
function valuesEqual(previous, next) {
    if (Array.isArray(previous) && Array.isArray(next)) {
        return (
            previous.length == next.length &&
            previous.every((value, index) => value == next[index])
        );
    }
    return previous == next;
}

/**
 * Synchronizes Core selection values with the retained renderer slots.
 *
 * @param {RetainedMark} retained
 * @param {import("../../marks/mark.js").default} mark
 */
function updateRetainedSelections(retained, mark) {
    const paramRuntime = mark.unitView?.paramRuntime;
    if (!paramRuntime) {
        return;
    }

    for (const [name, slot] of Object.entries(
        retained.handle.selections ?? {}
    )) {
        const selection = paramRuntime.findValue(name);
        if (!selection) {
            continue;
        }

        if (slot.type == "single") {
            const id = selection.uniqueId ?? 0;
            if (retained.selections.get(name) !== id) {
                slot.set(id);
                retained.selections.set(name, id);
            }
        } else if (slot.type == "multi") {
            const ids = Uint32Array.from(selection.data.keys());
            if (!uint32ArraysEqual(retained.selections.get(name), ids)) {
                slot.set(ids);
                retained.selections.set(name, ids);
            }
        } else if (slot.type == "interval") {
            let snapshot = /** @type {SelectionSnapshot | undefined} */ (
                retained.selections.get(name)
            );
            if (!snapshot || snapshot.type != "interval") {
                /** @type {Record<string, [number, number] | null>} */
                const intervals = {};
                for (const target of slot.targets) {
                    intervals[target] = null;
                }
                snapshot = {
                    type: "interval",
                    intervals,
                };
                retained.selections.set(name, snapshot);
            }

            let changed = false;
            for (const target of slot.targets) {
                const interval = selection.intervals?.[target] ?? null;
                const previous = snapshot.intervals[target];
                if (
                    interval == null
                        ? previous != null
                        : previous == null ||
                          previous[0] != interval[0] ||
                          previous[1] != interval[1]
                ) {
                    snapshot.intervals[target] = interval
                        ? [interval[0], interval[1]]
                        : null;
                    changed = true;
                }
            }
            if (changed) {
                slot.set(snapshot.intervals);
            }
        }
    }
}

/**
 * @param {unknown} previous
 * @param {Uint32Array} next
 */
function uint32ArraysEqual(previous, next) {
    if (!(previous instanceof Uint32Array) || previous.length != next.length) {
        return false;
    }
    return previous.every((value, index) => value == next[index]);
}

/**
 * @param {RetainedMark} retained
 * @param {any} config
 */
function hasSeriesChanges(retained, config) {
    if (retained.count != config.count) {
        return true;
    }

    for (const [name, channel] of Object.entries(config.channels)) {
        const series = getLogicalChannelSeries(channel);
        if (series !== undefined && retained.series[name] !== series) {
            return true;
        }
    }
    for (const [name, input] of Object.entries(config.inputs ?? {})) {
        if (retained.series[name] !== input.data) {
            return true;
        }
    }
    return false;
}

/**
 * @param {any} config
 * @returns {Record<string, import("@genome-spy/webgpu-renderer").SeriesData>}
 */
function collectSeries(config) {
    /** @type {Record<string, import("@genome-spy/webgpu-renderer").SeriesData>} */
    const series = {};
    for (const [name, channel] of Object.entries(config.channels)) {
        const channelSeries = getLogicalChannelSeries(channel);
        if (channelSeries !== undefined) {
            series[name] = channelSeries;
        }
    }
    for (const [name, input] of Object.entries(config.inputs ?? {})) {
        series[name] = input.data;
    }
    return series;
}

/** @param {any} channel */
function getChannelSeries(channel) {
    if (!channel) {
        return undefined;
    }
    if (ArrayBuffer.isView(channel.data) || Array.isArray(channel.data)) {
        return channel.data;
    } else if (typeof channel.value == "string") {
        return channel.value;
    } else {
        return undefined;
    }
}

/**
 * Returns the one series belonging to a logical channel. Core encoders allow
 * at most one non-constant branch, so a conditional series replaces the
 * logical channel's fallback series rather than creating a second public
 * series slot.
 *
 * @param {any} channel
 * @returns {import("@genome-spy/webgpu-renderer").SeriesData | undefined}
 */
function getLogicalChannelSeries(channel) {
    const series = getChannelSeries(channel);
    if (series !== undefined) {
        return series;
    }
    for (const condition of channel.conditions ?? []) {
        if (!condition.channel) {
            continue;
        }
        const conditionalSeries = getChannelSeries(condition.channel);
        if (conditionalSeries !== undefined) {
            return conditionalSeries;
        }
    }
    return undefined;
}

/**
 * @typedef {object} RetainedMark
 * @prop {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} definition
 * @prop {import("@genome-spy/webgpu-renderer").MarkHandle} handle
 * @prop {Record<string, import("@genome-spy/webgpu-renderer").SeriesData>} series
 * @prop {number} count
 * @prop {Map<string, number | Uint32Array | SelectionSnapshot>} selections
 * @prop {Map<string, number | number[]>} dynamicValues
 * @prop {Map<string, number>} scalarSlots
 */

/**
 * @typedef {object} SelectionSnapshot
 * @property {"interval"} type
 * @property {Record<string, [number, number] | null>} intervals
 */
