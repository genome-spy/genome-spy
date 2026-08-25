import { peek } from "../../utils/arrayUtils.js";
import ViewRenderingContext from "../../view/renderingContext/viewRenderingContext.js";
import {
    normalizeClipOptions,
    prepareMarkClipOptionsFromClip,
} from "../../view/renderingContext/clipOptions.js";
import { createAnchorCullBounds } from "../immediate/bounds.js";
import { RASTER_COORDINATE_OFFSET } from "../renderingConstants.js";
import Rectangle from "../../view/layout/rectangle.js";
import {
    countPerformance,
    measurePerformance,
} from "../../debug/performanceProfiler.js";
import {
    createWebGpuMarkConfig,
    getWebGpuMarkConfigRevision,
    getWebGpuMarkResourceRevision,
    getPackedMarkData,
    getPackedMarkRange,
} from "./webGpuMarkAdapter.js";

/**
 * Compiles a completed Core layout into an adapter-owned retained frame plan.
 */
export default class WebGpuViewRenderingContext extends ViewRenderingContext {
    /** @type {{view: import("../../view/view.js").default, coords: import("../../view/layout/rectangle.js").default}[]} */
    #viewStack = [];

    /** @type {Set<import("../../view/view.js").default>} */
    #views = new Set();

    /** @type {Map<import("../../marks/mark.js").default, MarkState>} */
    #marks = new Map();

    /** @type {Occurrence[]} */
    #occurrences = [];

    #finished = false;

    /**
     * @param {{surface: import("./webGpuSurface.js").default}} options
     */
    constructor(options) {
        super({});
        this.surface = options.surface;
    }

    getDevicePixelRatio() {
        return this.surface.getDevicePixelRatio();
    }

    /**
     * @param {import("../../view/view.js").default} view
     * @param {import("../../view/layout/rectangle.js").default} coords
     * @override
     */
    pushView(view, coords) {
        if (!this.#views.has(view)) {
            this.#views.add(view);
        }
        this.#viewStack.push({ view, coords });
    }

    /**
     * @param {import("../../view/view.js").default} view
     * @override
     */
    popView(view) {
        const entry = this.#viewStack.pop();
        if (entry?.view !== view) {
            throw new Error("Unbalanced WebGPU view rendering context stack.");
        }
    }

    /**
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("../../types/rendering.js").RenderingOptions} options
     * @override
     */
    renderMark(mark, options) {
        if (this.#finished) {
            throw new Error("Cannot collect WebGPU marks after finishing.");
        }
        const coords = this.currentCoords;
        const markCoords = coords.translate(
            RASTER_COORDINATE_OFFSET,
            RASTER_COORDINATE_OFFSET
        );
        let state = this.#marks.get(mark);
        if (!state) {
            state = {
                mark,
                occurrences: [],
                packed: undefined,
                source: undefined,
                generatedSource: false,
                indexed: mark.encoders?.facetIndex !== undefined,
                submittedIndexed: false,
                updated: false,
                active: false,
                ownerCoords: undefined,
                definition: undefined,
                config: undefined,
                properties: undefined,
                configRevision: -1,
                resourceRevision: -1,
                viewOpacity: NaN,
                resourcesDirty: true,
            };
            this.#marks.set(mark, state);
        }

        const inheritedClip = normalizeClipOptions(options);
        const occurrence = {
            state,
            options,
            markCoords,
            clip: prepareMarkClipOptionsFromClip(
                inheritedClip,
                mark.properties.clip,
                coords
            ),
            visibleRange: createVisibleRange(
                coords,
                inheritedClip,
                mark.properties.cullByVisibleRange
            ),
            range: { firstInstance: 0, instanceCount: 0 },
            placementIndex: state.occurrences.length,
        };
        state.occurrences.push(occurrence);
        this.#occurrences.push(occurrence);
        countPerformance("markOccurrences");
    }

    /** Completes frame-plan compilation. */
    finish() {
        if (this.#finished) {
            throw new Error(
                "The WebGPU rendering context is already finished."
            );
        }
        if (this.#viewStack.length) {
            throw new Error("Cannot finish with an open WebGPU view scope.");
        }
        this.#finished = true;

        const size = this.surface.getLogicalCanvasSize();
        const canvas = Rectangle.create(0, 0, size.width, size.height);
        for (const state of this.#marks.values()) {
            this.#compileMarkState(state, canvas);
        }
    }

    /**
     * Synchronizes live state and submits occurrences in original paint order.
     *
     * @param {{picking: boolean}} options
     */
    render({ picking }) {
        if (!this.#finished) {
            throw new Error("Cannot render an unfinished WebGPU frame plan.");
        }

        for (const view of this.#views) {
            measurePerformance("onBeforeRender", () => view.onBeforeRender());
            countPerformance("viewsVisited");
        }

        for (const state of this.#marks.values()) {
            state.submittedIndexed = false;
            state.updated = false;
            state.active = false;
            this.#prepareMarkState(state, picking);
        }
        let synchronizedMarks = 0;
        let changedMarks = 0;
        let resourceWrites = 0;
        for (const occurrence of this.#occurrences) {
            const writes = this.#submitOccurrence(occurrence, picking);
            if (writes !== undefined) {
                synchronizedMarks++;
                changedMarks += writes > 0 ? 1 : 0;
                resourceWrites += writes;
            }
        }
        countPerformance("retainedMarkSyncChecks", synchronizedMarks);
        countPerformance("retainedMarkSyncChanges", changedMarks);
        countPerformance("retainedResourceWrites", resourceWrites);
    }

    /**
     * Resolves placement ownership that remains stable until the next layout.
     *
     * @param {MarkState} state
     * @param {Rectangle} canvas
     */
    #compileMarkState(state, canvas) {
        const explicitSources = new Set(
            state.occurrences
                .map((occurrence) => {
                    const placement = occurrence.options.placement;
                    return state.indexed || placement?.index !== undefined
                        ? placement?.source
                        : undefined;
                })
                .filter(Boolean)
        );
        if (explicitSources.size > 1) {
            throw createViewError(
                state.mark,
                "One logical mark cannot use several placement sources."
            );
        }

        const resolvedSource = explicitSources.values().next().value;
        state.generatedSource = !resolvedSource && state.occurrences.length > 1;
        if (state.generatedSource) {
            const rectangles = new Float32Array(state.occurrences.length * 4);
            for (const occurrence of state.occurrences) {
                rectangles.set(
                    createCanvasPlacement(canvas, occurrence.markCoords),
                    occurrence.placementIndex * 4
                );
            }
            state.source = this.surface.updateOccurrencePlacements(
                state.mark,
                rectangles
            );
            state.ownerCoords = canvas;
        } else {
            state.source = resolvedSource;
            state.ownerCoords = state.occurrences[0].markCoords;
        }

        if (state.indexed && !state.source) {
            throw createViewError(
                state.mark,
                "Indexed placement requires a placement source."
            );
        }

        this.#validatePlacementTopology(state);
    }

    /**
     * @param {MarkState} state
     * @param {boolean} picking
     */
    #prepareMarkState(state, picking) {
        const viewOpacity = state.mark.unitView.getEffectiveOpacity();
        if (
            viewOpacity <= 0 ||
            (picking && !state.mark.isPickingParticipant())
        ) {
            return;
        }

        this.#validatePlacementTopology(state);

        const packed = getPackedMarkData(
            state.mark,
            state.generatedSource ? undefined : state.source
        );
        if (!packed.data.length) {
            return;
        }

        const configRevision = getWebGpuMarkConfigRevision(state.mark);
        const packedChanged = state.packed !== packed;
        const expressionChanged = state.configRevision !== configRevision;
        if (packedChanged || expressionChanged) {
            countPerformance(
                packedChanged
                    ? "markConfigurationPackedMiss"
                    : "markConfigurationExpressionMiss"
            );
            const first = state.occurrences[0];
            const configCoords = state.source
                ? Rectangle.create(
                      0,
                      0,
                      state.ownerCoords.width,
                      state.ownerCoords.height
                  )
                : state.ownerCoords;
            const translated = measurePerformance("markConfiguration", () =>
                createWebGpuMarkConfig(
                    state.mark,
                    first.options,
                    configCoords,
                    () => state.mark.unitView.getEffectiveOpacity(),
                    packed.data,
                    state.source && !state.indexed
                        ? { source: "draw" }
                        : undefined
                )
            );
            state.packed = packed;
            state.definition = translated?.definition;
            state.config = translated?.config;
            state.properties = translated?.properties;
            state.configRevision = configRevision;
        }
        if (packedChanged) {
            for (const occurrence of state.occurrences) {
                occurrence.range = getPackedMarkRange(
                    state.mark,
                    occurrence.options,
                    packed
                );
            }
        }
        const resourceRevision = getWebGpuMarkResourceRevision(state.mark);
        state.resourcesDirty ||=
            resourceRevision === undefined ||
            packedChanged ||
            expressionChanged ||
            state.resourceRevision !== resourceRevision ||
            state.viewOpacity !== viewOpacity;
        state.resourceRevision = resourceRevision ?? -1;
        state.viewOpacity = viewOpacity;
        state.active = !!state.config;
    }

    /** @param {MarkState} state */
    #validatePlacementTopology(state) {
        if (!state.source || state.generatedSource) {
            return;
        }

        const topologyRevision = state.source.getSnapshot().topology.revision;
        for (const occurrence of state.occurrences) {
            const captured = occurrence.options.placement?.topologyRevision;
            if (captured !== undefined && captured !== topologyRevision) {
                throw createViewError(
                    state.mark,
                    "Placement topology changed after layout completion."
                );
            }
        }
    }

    /**
     * @param {Occurrence} occurrence
     * @param {boolean} picking
     * @returns {number | undefined} Resource writes, or undefined when unchecked.
     */
    #submitOccurrence(occurrence, picking) {
        const state = occurrence.state;
        if (
            !state.active ||
            !state.config ||
            !state.definition ||
            !state.packed
        ) {
            return undefined;
        }
        if (state.indexed && state.submittedIndexed) {
            return undefined;
        }

        const range = occurrence.range;
        if (!range.instanceCount) {
            return undefined;
        }

        const placementIndex = state.generatedSource
            ? occurrence.placementIndex
            : occurrence.options.placement?.index;
        if (state.source && !state.indexed && placementIndex === undefined) {
            throw createViewError(
                state.mark,
                "Draw-level placement requires a resolved placement index."
            );
        }
        if (
            state.source &&
            !state.indexed &&
            !isPlacementVisible(
                state.source,
                placementIndex,
                state.ownerCoords,
                occurrence.clip,
                this.surface.getLogicalCanvasSize()
            )
        ) {
            return undefined;
        }

        let resourceWrites;
        if (!state.updated) {
            state.updated = true;
            if (state.resourcesDirty) {
                resourceWrites = measurePerformance(
                    "retainedResourceSynchronization",
                    () =>
                        this.surface.updateMark(
                            state.mark,
                            state.definition,
                            state.config,
                            state.properties ?? {}
                        )
                );
                state.resourcesDirty = false;
            }
        }

        this.surface.drawMark(state.mark, {
            ...(state.source ? { viewport: state.ownerCoords } : {}),
            ...(occurrence.clip
                ? { scissor: this.#createScissor(occurrence.clip) }
                : {}),
            ...(occurrence.visibleRange
                ? {
                      visibleRange: state.source
                          ? localizeVisibleRange(
                                occurrence.visibleRange,
                                state.ownerCoords
                            )
                          : occurrence.visibleRange,
                  }
                : {}),
            ...(state.source
                ? {
                      placement: {
                          source: state.source,
                          ...(placementIndex === undefined
                              ? {}
                              : { index: placementIndex }),
                          ...(occurrence.options.placement?.clipToPlacement
                              ? {
                                    clipToPlacement:
                                        occurrence.options.placement
                                            .clipToPlacement,
                                }
                              : {}),
                      },
                  }
                : {}),
            firstInstance: range.firstInstance,
            instanceCount: range.instanceCount,
            picking,
        });
        countPerformance("drawCommands");
        if (state.indexed) {
            state.submittedIndexed = true;
        }
        return resourceWrites;
    }

    /**
     * Expands unclipped dimensions to the full canvas. The renderer intersects
     * the resulting logical-pixel scissor with the canvas bounds.
     *
     * @param {import("../../types/rendering.js").ClipOptions} clip
     * @returns {import("@genome-spy/webgpu-renderer").DrawRect}
     */
    #createScissor(clip) {
        const canvas = this.surface.getLogicalCanvasSize();
        return {
            x: clip.clipX ? clip.rect.x : 0,
            y: clip.clipY ? clip.rect.y : 0,
            width: clip.clipX ? clip.rect.width : canvas.width,
            height: clip.clipY ? clip.rect.height : canvas.height,
        };
    }

    get currentCoords() {
        const entry = peek(this.#viewStack);
        if (!entry) {
            throw new Error("No current view in WebGPU rendering context.");
        }
        return entry.coords;
    }
}

/**
 * Maps an occurrence rectangle into a positive-area canvas-owned placement.
 * Zero-thickness axis views still need one logical pixel for their strokes.
 *
 * @param {Rectangle} canvas
 * @param {Rectangle} target
 * @returns {[number, number, number, number]}
 */
function createCanvasPlacement(canvas, target) {
    return [
        (target.x - canvas.x) / canvas.width,
        (target.y - canvas.y) / canvas.height,
        Math.max(target.width, 1) / canvas.width,
        Math.max(target.height, 1) / canvas.height,
    ];
}

/**
 * Resolves draw-index visibility using only dense placement geometry.
 *
 * @param {import("../../view/layout/placementSource.js").default} source
 * @param {number} index
 * @param {Rectangle} owner
 * @param {import("../../types/rendering.js").ClipOptions | undefined} clip
 * @param {{width: number, height: number}} canvas
 */
function isPlacementVisible(source, index, owner, clip, canvas) {
    const rectangles = source.getSnapshot().rectangles;
    const offset = index * 4;
    if (offset + 3 >= rectangles.length) {
        return false;
    }

    const x = owner.x + rectangles[offset] * owner.width;
    const y = owner.y + rectangles[offset + 1] * owner.height;
    const width = rectangles[offset + 2] * owner.width;
    const height = rectangles[offset + 3] * owner.height;
    if (width <= 0 || height <= 0) {
        return false;
    }

    const x1 = clip?.clipX ? Math.max(0, clip.rect.x) : 0;
    const y1 = clip?.clipY ? Math.max(0, clip.rect.y) : 0;
    const x2 = clip?.clipX
        ? Math.min(canvas.width, clip.rect.x2)
        : canvas.width;
    const y2 = clip?.clipY
        ? Math.min(canvas.height, clip.rect.y2)
        : canvas.height;
    return x < x2 && y < y2 && x + width > x1 && y + height > y1;
}

/**
 * Placement-enabled mark channels are viewport-local, so anchor-culling bounds
 * must use the same coordinate system.
 *
 * @param {import("@genome-spy/webgpu-renderer").DrawVisibleRange} range
 * @param {Rectangle} owner
 * @returns {import("@genome-spy/webgpu-renderer").DrawVisibleRange}
 */
function localizeVisibleRange(range, owner) {
    return {
        ...range,
        x1: range.x1 - owner.x,
        y1: range.y1 - owner.y,
        x2: range.x2 - owner.x,
        y2: range.y2 - owner.y,
    };
}

/**
 * @typedef {object} MarkState
 * @property {import("../../marks/mark.js").default} mark
 * @property {Occurrence[]} occurrences
 * @property {import("./webGpuMarkAdapter.js").PackedMarkData | undefined} packed
 * @property {import("../../view/layout/placementSource.js").default | undefined} source
 * @property {boolean} generatedSource
 * @property {boolean} indexed
 * @property {boolean} submittedIndexed
 * @property {boolean} updated
 * @property {boolean} active
 * @property {Rectangle | undefined} ownerCoords
 * @property {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any> | undefined} definition
 * @property {object | undefined} config
 * @property {Record<string, {value: any}> | undefined} properties
 * @property {number} configRevision
 * @property {number} resourceRevision
 * @property {number} viewOpacity
 * @property {boolean} resourcesDirty
 */

/**
 * @typedef {object} Occurrence
 * @property {MarkState} state
 * @property {import("../../types/rendering.js").RenderingOptions} options
 * @property {Rectangle} markCoords
 * @property {import("../../types/rendering.js").ClipOptions | undefined} clip
 * @property {import("@genome-spy/webgpu-renderer").DrawVisibleRange | undefined} visibleRange
 * @property {{firstInstance: number, instanceCount: number}} range
 * @property {number} placementIndex
 */

/**
 * Converts Core's absolute anchor-culling bounds to the renderer's draw
 * contract. Unselected axes use harmless finite values because their flags
 * disable those comparisons in WGSL.
 *
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {import("../../types/rendering.js").ClipOptions | undefined} clip
 * @param {import("../../spec/mark.js").MarkProps["cullByVisibleRange"]} cull
 * @returns {import("@genome-spy/webgpu-renderer").DrawVisibleRange | undefined}
 */
function createVisibleRange(coords, clip, cull) {
    const cullX = cull === true || cull === "x";
    const cullY = cull === true || cull === "y";
    if (!cullX && !cullY) {
        return undefined;
    }

    const bounds = createAnchorCullBounds(coords, clip, cull);
    return {
        x1: cullX ? bounds.x1 : 0,
        y1: cullY ? bounds.y1 : 0,
        x2: cullX ? bounds.x2 : coords.x2,
        y2: cullY ? bounds.y2 : coords.y2,
        cullX,
        cullY,
    };
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} message
 */
function createViewError(mark, message) {
    const error = new Error(
        `${message} Mark: ${mark.getType()}. View: ${mark.unitView.getPathString()}`
    );
    /** @type {any} */ (error).view = mark.unitView;
    return error;
}
