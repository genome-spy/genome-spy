import { createRenderer } from "@genome-spy/webgpu-renderer";

import CanvasSizeHelper from "../canvasSizeHelper.js";
import PlacementSource from "../../view/layout/placementSource.js";

/** @type {Readonly<Record<string, {value: any}>>} */
const EMPTY_PROPERTIES = Object.freeze({});

/**
 * @param {import("../../marks/mark.js").default} mark
 * @returns {string}
 */
function getGpuMarkLabel(mark) {
    return `${mark.unitView.getPathString()} [${mark.getType()}]`;
}

/**
 * Owns the live WebGPU canvas and the low-level renderer used by the PoC.
 */
export default class WebGpuSurface {
    /** @type {CanvasSizeHelper} */
    #sizeHelper;

    /** @type {import("@genome-spy/webgpu-renderer").Renderer | undefined} */
    #renderer;

    #finalized = false;

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
            onDeviceLoss: (info) => {
                if (!this.#finalized) {
                    const detail = info.message ? `: ${info.message}` : "";
                    this.options.onError?.(
                        new Error(
                            `WebGPU device was lost (${info.reason})${detail}`
                        )
                    );
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
     * @param {Record<string, {value: any}>} [properties]
     * @returns {number} Number of retained resource writes.
     */
    updateMark(mark, definition, config, properties = EMPTY_PROPERTIES) {
        if (!this.#renderer) {
            throw new Error("The WebGPU surface has not been initialized.");
        }

        this.#registerMarkOwner(mark);
        let retained = this.#marks.get(mark);
        if (!retained || retained.definition !== definition) {
            if (retained) {
                this.#renderer.destroyMark(retained.handle.markId);
            }
            const handle = this.#renderer.createMark(definition, config, {
                label: getGpuMarkLabel(mark),
            });
            retained = {
                definition,
                handle,
                config,
                properties,
                bindings: compileResourceBindings(handle, config, properties),
                series: collectSeries(config),
                count: config.count,
                selections: new Map(),
            };
            this.#marks.set(mark, retained);
        }
        let writes = 0;
        retained.handle.batchUpdates(() => {
            const configChanged = retained.config !== config;
            if (configChanged && hasSeriesChanges(retained, config)) {
                retained.series = collectSeries(config);
                retained.count = config.count;
                retained.handle.series.replace(retained.series, retained.count);
                writes++;
            }
            if (configChanged || retained.properties !== properties) {
                // Renderer slot shape is immutable for one definition.
                // TODO: Recreate the handle if Core relaxes that contract.
                retained.bindings = compileResourceBindings(
                    retained.handle,
                    config,
                    properties,
                    retained.bindings
                );
                retained.config = config;
                retained.properties = properties;
            }
            writes += updateResourceBindings(retained.bindings);
            writes += updateRetainedSelections(retained, mark);
        });
        return writes;
    }

    /**
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("@genome-spy/webgpu-renderer").DrawCommand} draw
     * @param {PlacementSource | undefined} placementSource
     * @param {boolean} picking
     */
    drawMark(mark, draw, placementSource, picking) {
        if (!this.#renderer) {
            throw new Error("The WebGPU surface has not been initialized.");
        }
        const retained = this.#marks.get(mark);
        if (!retained) {
            throw new Error("Cannot draw a WebGPU mark before updating it.");
        }

        draw.mark = retained.handle;
        if (placementSource) {
            if (!draw.placement) {
                throw new Error(
                    "Placement source requires a materialized draw placement."
                );
            }
            draw.placement.set = this.getPlacementSet(placementSource);
        }
        (picking ? this.#pickingDraws : this.#frameDraws).push(draw);
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
        if (this.#finalized) {
            return;
        }
        this.#finalized = true;
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

/**
 * Compiles Core's live leaves into direct renderer-slot updates. Reusing the
 * previous values preserves change detection when a translated config is
 * replaced while keeping dirty-frame work flat and reflection-free.
 *
 * @param {import("@genome-spy/webgpu-renderer").MarkHandle<any, Record<string, any>>} handle
 * @param {any} config
 * @param {Record<string, {value: any}>} properties
 * @param {ResourceBinding[]} [previousBindings]
 * @returns {ResourceBinding[]}
 */
function compileResourceBindings(
    handle,
    config,
    properties,
    previousBindings = []
) {
    const previousValues = new Map(
        previousBindings.map((binding) => [binding.key, binding.value])
    );
    /** @type {ResourceBinding[]} */
    const bindings = [];

    /**
     * @param {string} key
     * @param {() => any} read
     * @param {(value: any) => void} write
     * @param {boolean} [skipUndefined]
     */
    const add = (key, read, write, skipUndefined = false) => {
        bindings.push({
            key,
            read,
            write,
            value: previousValues.has(key)
                ? previousValues.get(key)
                : snapshotValue(read()),
            skipUndefined,
        });
    };

    for (const [name, channel] of Object.entries(config.channels)) {
        compileChannelBindings(
            add,
            `channel:${name}:default`,
            handle.scales[name]?.default,
            handle.values[name]?.default,
            channel
        );

        for (const condition of channel.conditions ?? []) {
            if (!condition.channel) {
                continue;
            }
            const selection = condition.when.selection;
            compileChannelBindings(
                add,
                `channel:${name}:condition:${selection}`,
                handle.scales[name]?.conditions?.[condition.when.selection],
                handle.values[name]?.conditions?.[condition.when.selection],
                condition.channel
            );
        }
    }

    for (const [name, property] of Object.entries(properties)) {
        const slot = handle.properties?.[name];
        if (!slot) {
            throw new Error(`Renderer mark has no property slot "${name}".`);
        }
        add(
            `property:${name}`,
            () => property.value,
            (value) => slot.set(value)
        );
    }

    for (const [name, scalar] of Object.entries(config.scalarSlots ?? {})) {
        const slot = handle.scalarSlots?.[name];
        if (slot) {
            add(
                `scalar:${name}`,
                () => scalar.value,
                (value) => slot.set(value)
            );
        }
    }
    return bindings;
}

/**
 * @param {(key: string, read: () => any, write: (value: any) => void, skipUndefined?: boolean) => void} add
 * @param {string} key
 * @param {import("@genome-spy/webgpu-renderer").ScaleSlotHandle | undefined} scaleSlot
 * @param {import("@genome-spy/webgpu-renderer").ValueSlotHandle | undefined} valueSlot
 * @param {any} channel
 */
function compileChannelBindings(add, key, scaleSlot, valueSlot, channel) {
    if (scaleSlot && channel.scale) {
        if ("domain" in channel.scale) {
            add(
                key + ":domain",
                () => channel.scale.domain,
                (value) => scaleSlot.setDomain(value),
                true
            );
        }
        if ("range" in channel.scale) {
            add(
                key + ":range",
                () => channel.scale.range,
                (value) => scaleSlot.setRange(value),
                true
            );
        }
    }

    if (valueSlot && "value" in channel) {
        add(
            key + ":value",
            () => channel.value,
            (value) => valueSlot.set(value),
            true
        );
    }
}

/**
 * @param {ResourceBinding[]} bindings
 * @returns {number} Number of retained resource writes.
 */
function updateResourceBindings(bindings) {
    let writes = 0;
    for (const binding of bindings) {
        const value = binding.read();
        if (
            (binding.skipUndefined && value === undefined) ||
            valuesEqual(binding.value, value)
        ) {
            continue;
        }
        binding.write(value);
        writes++;
        binding.value = snapshotValue(value);
    }
    return writes;
}

/**
 * @param {any} value
 * @returns {any}
 */
function snapshotValue(value) {
    // Typed series and selections have separate revision/copy paths and must
    // not enter this scalar-or-ordinary-array snapshot path.
    return Array.isArray(value) ? value.map(snapshotValue) : value;
}

/**
 * @param {unknown} previous
 * @param {unknown} next
 * @returns {boolean}
 */
function valuesEqual(previous, next) {
    if (previous === next) {
        return true;
    }
    if (Array.isArray(previous) && Array.isArray(next)) {
        return (
            previous.length == next.length &&
            previous.every((value, index) => valuesEqual(value, next[index]))
        );
    }
    return false;
}

/**
 * Synchronizes Core selection values with the retained renderer slots.
 *
 * @param {RetainedMark} retained
 * @param {import("../../marks/mark.js").default} mark
 * @returns {number} Number of retained resource writes.
 */
function updateRetainedSelections(retained, mark) {
    const paramRuntime = mark.unitView?.paramRuntime;
    if (!paramRuntime) {
        return 0;
    }

    let writes = 0;
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
                writes++;
                retained.selections.set(name, id);
            }
        } else if (slot.type == "multi") {
            const ids = Uint32Array.from(selection.data.keys());
            if (!uint32ArraysEqual(retained.selections.get(name), ids)) {
                slot.set(ids);
                writes++;
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
                writes++;
            }
        }
    }
    return writes;
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
    if (
        config.placementIndex?.data &&
        retained.series.__placementIndex !== config.placementIndex.data
    ) {
        return true;
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
    if (config.placementIndex?.data) {
        series.__placementIndex = config.placementIndex.data;
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
 * @prop {import("@genome-spy/webgpu-renderer").MarkHandle<any, Record<string, any>>} handle
 * @prop {any} config
 * @prop {Record<string, {value: any}>} properties
 * @prop {ResourceBinding[]} bindings
 * @prop {Record<string, import("@genome-spy/webgpu-renderer").SeriesData>} series
 * @prop {number} count
 * @prop {Map<string, number | Uint32Array | SelectionSnapshot>} selections
 */

/**
 * @typedef {object} ResourceBinding
 * @property {string} key
 * @property {() => any} read
 * @property {(value: any) => void} write
 * @property {any} value
 * @property {boolean} skipUndefined
 */

/**
 * @typedef {object} SelectionSnapshot
 * @property {"interval"} type
 * @property {Record<string, [number, number] | null>} intervals
 */
