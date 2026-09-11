import { ScaleResolutionApi } from "./scaleResolutionApi.js";
import { TooltipHandler } from "../tooltip/tooltipHandler.js";
import { RootSpec } from "../spec/root.js";
import { GenomeSpyConfig } from "../spec/config.js";
import { Scalar } from "../spec/channel.js";
import { IntervalSelection } from "./selectionTypes.js";
import { ImportSpec, ViewSpec } from "../spec/view.js";
import { ViewSelector } from "../view/viewUtilTypes.js";

/**
 * Embeds GenomeSpy into the DOM
 *
 * @param el HTMLElement or a query selector
 * @param spec A spec object or an URL to a JSON spec
 * @param options Options
 */
export type EmbedFunction = (
    el: HTMLElement | string,
    spec: RootSpec | string,
    options?: EmbedOptions
) => Promise<EmbedResult>;

export interface EmbedOptions {
    /**
     * Rendering backend. `"auto"` uses WebGL2 when available and falls back to
     * the Canvas2D compatibility renderer. `"webgpu"` enables an experimental
     * proof-of-concept renderer for a narrow subset of marks. `"canvas"` does
     * not request WebGL or WebGPU and uses software-based datum picking.
     *
     * __Default value:__ `"auto"`
     */
    renderer?: "auto" | "webgl" | "canvas" | "webgpu";

    /**
     * A function that allows retrieval of named data. There are two ways to provide named data:
     * 1. A data provider (this)
     * 2. Explicit updates using the `updateNamedData` method (the other).
     *
     * @deprecated Declare the dataset in the owning view and provide initial
     * rows through the specification or update it through
     * `EmbedResult.datasets.set()` for a top-level declaration or
     * `ViewHandle.datasets.set()` for a nested declaration.
     */
    namedDataProvider?: (name: string) => any[];

    /**
     * Custom tooltip handlers. Use `"default"` to override the default handler
     */
    tooltipHandlers?: Record<string, TooltipHandler>;

    /**
     * Where to put the input binding elements. The default is `"default"`, which means that
     * the input binding elements are placed in the same container as the GenomeSpy instance.
     */
    inputBindingContainer?: HTMLElement | "none" | "default";

    /**
     * A suggestion for the browser on the appropriate GPU setup for the WebGL
     * environment. This setting has no effect in Canvas2D mode.
     *
     * __Default value:__ `"default"` in `@genome-spy/core` and
     * `"high-performance"` in `@genome-spy/app`
     */
    powerPreference?: "default" | "high-performance" | "low-power";

    /**
     * Optional theme configuration object that is merged after the internal
     * defaults and built-in theme, but before `spec.config`.
     */
    theme?: GenomeSpyConfig;

    /**
     * Optional hook for handling launch errors. Return true to suppress default UI.
     */
    onError?: (error: unknown, container: HTMLElement) => boolean | void;
}

/**
 * Runtime value type covered by the default embed parameter API.
 *
 * The default type covers scalar variable parameters and interval selections.
 * Object and array variable parameters are supported at runtime, but callers
 * should provide their own generic type when accessing them:
 *
 * `const param = api.getParam<MyValue>("myParam")`
 *
 * Current limitations:
 *
 * - Parameters are addressed by name only. Independent same-name parameters
 *   throw an ambiguity error.
 * - Computed `expr` parameters are readable but cannot be written.
 * - Point selections are exposed through `ParamNamespace.getSelection()`;
 *   they are not writable through the generic parameter API.
 * - Projected selections are not supported.
 */
export type ParamValue = Scalar | null | undefined | IntervalSelection;

/**
 * A handle for reading, writing, and subscribing to an explicit parameter.
 */
export interface ParamApi<T = ParamValue> {
    /**
     * Returns the current parameter value.
     */
    getValue: () => T;

    /**
     * Sets the parameter value. Computed `expr` parameters throw when set.
     */
    setValue: (value: T) => void;

    /**
     * Subscribes to parameter changes. Returns an unsubscribe function.
     */
    subscribe: (listener: (value: T) => void) => () => void;
}

/**
 * Detached value of an interval selection.
 *
 * An interval is active when at least one configured channel has a range. The
 * ranges are expressed in data-domain values, not canvas coordinates.
 */
export interface IntervalSnapshot {
    /** Discriminator for interval selection snapshots. */
    type: "interval";

    /** Whether at least one interval is currently set. */
    active: boolean;

    /** Selected range for each configured positional channel, or `null`. */
    intervals: Partial<Record<"x" | "y", readonly [number, number] | null>>;
}

/**
 * Detached value of a point selection.
 *
 * Each row in `data` is a shallow copy of the selected datum without
 * GenomeSpy's internal picking identifier.
 */
export interface PointSnapshot {
    /** Discriminator for point selection snapshots. */
    type: "point";

    /** Whether at least one row is currently selected. */
    active: boolean;

    /** Selected data rows, in selection order. */
    data: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

/** A detached snapshot of either an interval or point selection. */
export type SelectionSnapshot = IntervalSnapshot | PointSnapshot;

/**
 * Capability for reading and clearing a row-backed point selection.
 *
 * Point selections are exposed as detached snapshots. Use `clear()` to empty
 * the selection; writes through this capability are not supported.
 *
 * `"commit"` is accepted for future gesture-based point selections, such as a
 * lasso. For the current point-selection implementation, it has the same
 * delivery behavior as `"change"`.
 */
export interface PointSelectionApi {
    /** Discriminator for this selection capability. */
    readonly type: "point";

    /** Returns the current detached selection snapshot. */
    getValue: () => PointSnapshot;

    /**
     * Subscribes to future selection updates and returns an unsubscribe
     * function. Delivery defaults to every change; `"commit"` is accepted for
     * symmetry with interval selections and follows the point selection's
     * normal update delivery.
     */
    subscribe: (
        listener: (value: PointSnapshot) => void,
        options?: { delivery?: "change" | "commit" }
    ) => () => void;

    /** Clears the selection and publishes the cleared state when it changed. */
    clear: () => void;
}

/**
 * Capability for reading, clearing, and testing membership in an interval
 * selection.
 */
export interface IntervalSelectionApi {
    /** Discriminator for this selection capability. */
    readonly type: "interval";

    /** Returns the current detached selection snapshot. */
    getValue: () => IntervalSnapshot;

    /**
     * Subscribes to future selection updates and returns an unsubscribe
     * function. Delivery defaults to every change; `"commit"` reports a
     * completed brush or a committed programmatic update.
     */
    subscribe: (
        listener: (value: IntervalSnapshot) => void,
        options?: { delivery?: "change" | "commit" }
    ) => () => void;

    /** Clears the selection and publishes the cleared state when it changed. */
    clear: () => void;

    /**
     * Tests whether a canvas point is inside the current interval selection.
     * Coordinates are CSS pixels relative to the embedded GenomeSpy canvas.
     */
    contains: (point: { x: number; y: number }) => boolean;
}

/** A public capability for either a point or interval selection. */
export type SelectionApi = PointSelectionApi | IntervalSelectionApi;

/**
 * Parameters and selections resolved from one view's lexical scope.
 *
 * A scoped namespace resolves the nearest declaration in that view and its
 * ancestors. Use `EmbedResult.params` for the authored top-level scope or a
 * `ViewHandle.params` namespace for a particular view. Handles returned from
 * this namespace are live capabilities: operations fail after finalization or,
 * for a view-scoped namespace, after that view is removed.
 */
export interface ParamNamespace {
    /**
     * Returns a handle for a parameter declared in this scope or an ancestor.
     * Use a generic type argument when the parameter contains an object or
     * array value.
     */
    get: <T = ParamValue>(name: string) => ParamApi<T>;

    /**
     * Returns a capability for a named point or interval selection.
     *
     * Throws when the name is not declared as a supported selection in this
     * scope.
     */
    getSelection: (name: string) => SelectionApi;
}

/**
 * Native input delivered before GenomeSpy handles an event.
 *
 * The point uses CSS-pixel coordinates relative to the embedded canvas. Calling
 * `preventViewDefault()` vetoes Core's default interaction while leaving
 * browser-level cancellation to `sourceEvent.preventDefault()`. Use this API
 * for input at the canvas level; use `ViewHandle.marks` for interactions tied
 * to a picked mark.
 */
export interface NativeEvent {
    /** Browser event that triggered the input. */
    readonly sourceEvent: Event;

    /** Canvas-relative CSS-pixel coordinates of the input event. */
    readonly point: { readonly x: number; readonly y: number };

    /** Prevents GenomeSpy's default handling of this input event. */
    preventViewDefault: () => void;
}

/** Event names supported by `EmbedEventApi.subscribe()`. */
export type NativeEventType =
    | "click"
    | "dblclick"
    | "contextmenu"
    | "mousedown"
    | "mouseup"
    | "mousemove"
    | "mouseenter"
    | "mouseleave"
    | "wheel";

/** Subscriptions for native input on the embedded GenomeSpy canvas. */
export interface EmbedEventApi {
    /**
     * Subscribes synchronously before Core handles the event and returns an
     * unsubscribe function.
     */
    subscribe: (
        type: NativeEventType,
        listener: (event: NativeEvent) => void
    ) => () => void;
}

/**
 * A mark hit from the current rendered scene.
 *
 * The datum is a detached shallow copy. Nested values are not cloned.
 */
export interface MarkHit {
    /** Canonical handle for the unit view that owns the mark. */
    readonly view: ViewHandle;

    /** Picking identifier for the mark in the current rendered scene. */
    readonly uniqueId: number;

    /** Data row associated with the mark, without the internal picking id. */
    readonly datum: Readonly<Record<string, unknown>>;
}

/**
 * A mark interaction event scoped to a `ViewHandle` subtree.
 *
 * Mark activation uses the latest confirmed hover hit. It does not start a new
 * pick, so a fast interaction can produce no mark event. A pending hover result
 * is not replayed as a later activation.
 */
export interface MarkEvent {
    /** Browser event that triggered the mark interaction. */
    readonly sourceEvent: MouseEvent;

    /** Canvas-relative CSS-pixel coordinates of the interaction. */
    readonly point: { readonly x: number; readonly y: number };

    /** Mark and datum confirmed by the renderer's picking state. */
    readonly hit: MarkHit;
}

/**
 * Mark interaction subscriptions and explicit picking for one view subtree.
 *
 * Subscriptions belong to the view handle that created them and are disposed
 * automatically when that view is removed or the embed is finalized.
 */
export interface MarksApi {
    /**
     * Subscribes to a mark event and returns an unsubscribe function.
     *
     * Events use the current confirmed hover hit and do not start another pick,
     * so a rapid interaction can have no matching hit.
     */
    subscribe: (
        type: "click" | "dblclick" | "contextmenu",
        listener: (event: MarkEvent) => void
    ) => () => void;

    /**
     * Subscribes to changes in the current hovered mark and returns an
     * unsubscribe function. The listener is called once immediately with the
     * current hit, or `undefined` when no mark is hovered.
     */
    observeHover: (listener: (hit: MarkHit | undefined) => void) => () => void;

    /**
     * Explicitly queries the latest completed picking frame at a canvas point.
     *
     * The promise resolves with `"hit"`, `"empty"`, or `"invalidated"` when
     * the scene changed or the embed was finalized before the query completed.
     * It rejects when the active renderer does not support picking.
     */
    pick: (point: {
        x: number;
        y: number;
    }) => Promise<
        | { status: "hit"; hit: MarkHit }
        | { status: "empty" }
        | { status: "invalidated" }
    >;
}

/**
 * Address of a view in the live layout hierarchy.
 *
 * Use a `ViewSelector` to resolve an authored, named view within import or
 * insertion scopes. Selectors cannot reliably identify anonymous views,
 * repeated instances, or one particular dynamically inserted instance. Use a
 * `ViewHandle` for the exact live view returned by this API, including those
 * cases. Use `"root"` to address the root view.
 */
export type ViewAddress = ViewHandle | ViewSelector | "root";

/**
 * Options for inserting a new child view or subtree.
 */
export interface InsertViewOptions {
    /**
     * Child index where the view is inserted. If omitted, the view is appended.
     */
    index?: number;

    /**
     * Optional scope name for the inserted subtree.
     *
     * The scope makes repeated instances of the same spec independently
     * addressable by selectors. It does not replace the inserted root view's
     * own `name`.
     */
    scope?: string | null;
}

/**
 * Public view kind reported by `ViewHandle`.
 */
export type ViewHandleType = "unit" | "layer" | "concat" | "grid" | "unknown";

/**
 * Last rendered layout bounds for a view, in CSS pixels.
 *
 * The coordinate space is the embedded GenomeSpy canvas. Convert these bounds
 * to DOM coordinates in the embedding application when positioning external
 * controls.
 */
export interface ViewLayoutBounds {
    /**
     * Horizontal position of the view's left edge.
     */
    x: number;

    /**
     * Vertical position of the view's top edge.
     */
    y: number;

    /**
     * View width.
     */
    width: number;

    /**
     * View height.
     */
    height: number;
}

/**
 * Options for reordering a view within its current parent container.
 */
export interface MoveViewOptions {
    /**
     * Destination child index within the target's current parent.
     *
     * The index is zero-based and is interpreted after temporarily removing
     * the target from its parent. Values from `0` through the remaining child
     * count are valid. A value equal to the remaining child count places the
     * target last. Negative values and larger values throw.
     *
     * For children `[A, B, C, D]`, moving `B` with `index: 3` results in
     * `[A, C, D, B]`.
     */
    index: number;
}

/**
 * Runtime updates for datasets declared by one exact owner.
 *
 * The dataset must be declared in the owner's `datasets` property.
 */
export interface BinaryDatasetFormat {
    /** Binary serialization format. */
    type: "arrow" | "parquet";
}

export interface DatasetApi {
    /**
     * Replaces a named dataset declared by the associated owner.
     *
     * Descendant views that resolve the declaration receive the updated data.
     */
    set: <T = unknown>(name: string, data: T[]) => void;

    /**
     * Decodes an in-memory binary payload and replaces a named dataset declared
     * by the associated owner.
     *
     * If loads overlap, only the most recently started dataset operation is
     * applied. The promise resolves after dataflow propagation and render
     * scheduling, but does not wait for the next animation frame.
     */
    load: (
        name: string,
        data: ArrayBuffer | ArrayBufferView,
        format: BinaryDatasetFormat
    ) => Promise<void>;

    /**
     * Restores a named dataset declared by the associated owner to its configured
     * values.
     */
    reset: (name: string) => void;
}

// Design intent: "Opaque" below means that callers cannot access the internal
// View representation; it does not mean that this is an inert address.
// ViewHandle is a capability-bearing reference. Operations scoped to one view
// belong here under resource namespaces, while hierarchy-wide lookup and
// structural mutations remain on ViewApi.

/**
 * Live handle to a view in the embedded GenomeSpy instance.
 *
 * The exposed hierarchy matches the layout tree derived from the
 * visualization spec: unit views and container views are represented as view
 * handles, and child order is the layout order declared by the spec.
 * GenomeSpy may add an implicit root layout container, for example when a
 * root unit view needs space for axes, titles, or other guides.
 *
 * Handles are opaque public references to one concrete view instance. They do
 * not expose internal `View` objects, are not bookmark or serialization
 * formats, and should not be reused after `isAlive()` becomes false. Methods
 * on a stale handle also fail rather than silently operating on another view.
 */
export interface ViewHandle {
    /**
     * Runtime-stable id for this handle.
     *
     * The id is stable only for the current embedded instance. It is not a
     * bookmark or serialization format.
     */
    readonly id: string;

    /**
     * Explicit view name, if the view has one.
     */
    readonly name: string | undefined;

    /**
     * Selector for this view, if the view is addressable by selector.
     */
    readonly selector: ViewSelector | undefined;

    /**
     * Public view kind.
     */
    readonly type: ViewHandleType;

    /**
     * Returns whether the referenced view is still part of the live hierarchy.
     */
    isAlive: () => boolean;

    /**
     * Returns a handle to the layout parent, if the view has one.
     */
    parent: () => ViewHandle | undefined;

    /**
     * Returns handles for the current layout child views in spec order.
     */
    children: () => ViewHandle[];

    /**
     * Updates datasets declared by this exact view.
     */
    readonly datasets: DatasetApi;

    /** Parameters and selections resolved from this view's lexical scope. */
    readonly params: ParamNamespace;

    /** Mark interaction and picking scoped to this view's subtree. */
    readonly marks: MarksApi;
}

/**
 * API for inspecting and mutating the live layout hierarchy.
 *
 * The hierarchy model matches the layout tree derived from the visualization
 * spec. The API addresses view nodes such as unit, layer, concat, and grid
 * views, plus implicit layout containers that GenomeSpy may add at the root.
 * It does not address rendered marks, guide primitives, DOM nodes, or other
 * internal implementation objects.
 *
 * Mutations are asynchronous because view creation, imports, dataflow
 * initialization, data loading, guide rebuilding, and layout updates may all be
 * involved. Mutation promises resolve when the operation-specific lifecycle has
 * completed.
 */
export interface ViewApi {
    /**
     * Returns a handle to the root layout view.
     *
     * The root may be an implicit layout container rather than the top-level
     * view declared by the input spec.
     */
    root: () => ViewHandle;

    /**
     * Resolves an address to a live view handle.
     *
     * Selectors resolve the current matching authored view. A selector that is
     * missing or ambiguous, or a handle that no longer refers to a live view,
     * returns `undefined`.
     */
    resolve: (address: ViewAddress) => ViewHandle | undefined;

    /**
     * Resolves an address to a live view handle.
     *
     * Throws if the address cannot be resolved, is ambiguous, or if a handle no
     * longer refers to a live view.
     */
    get: (address: ViewAddress) => ViewHandle;

    /**
     * Returns the last rendered layout bounds for a view.
     *
     * Bounds are returned in CSS pixels in the embedded GenomeSpy canvas
     * coordinate space. Returns `undefined` if the address is unresolved, the
     * view is no longer live, or the view has not been rendered yet.
     */
    getLayoutBounds: (address: ViewAddress) => ViewLayoutBounds | undefined;

    /**
     * Subscribes to completed layout updates.
     *
     * The listener is called after a layout/render pass has updated view
     * bounds. Returns an unsubscribe function.
     */
    subscribeToLayout: (listener: () => void) => () => void;

    /**
     * Inserts a new child view or subtree under a mutable container view.
     *
     * The `spec` can be an ordinary view spec or an import spec. Use
     * `options.scope` to give the inserted instance a selector scope, allowing
     * the same spec to be inserted multiple times and addressed independently.
     */
    insert: (
        parent: ViewAddress,
        spec: ViewSpec | ImportSpec,
        options?: InsertViewOptions
    ) => Promise<ViewHandle>;

    /**
     * Removes a view and disposes its subtree.
     *
     * Removing the root view is not supported.
     */
    remove: (target: ViewAddress) => Promise<void>;

    /**
     * Reorders a view within its current parent container.
     *
     * `options.index` is the destination index after temporarily removing the
     * target from its current position.
     *
     * Moving a view to another branch of the hierarchy is not supported by the
     * initial API.
     */
    move: (
        target: ViewAddress,
        options: MoveViewOptions
    ) => Promise<ViewHandle>;

    /**
     * Runs multiple mutations as one ordered transaction.
     *
     * Implementations may defer layout and rendering work until the callback
     * has completed.
     */
    transaction: <T>(
        callback: (views: ViewApi) => T | Promise<T>
    ) => Promise<T>;
}

/**
 * @deprecated Use `ViewApi`. The `api.views` namespace now includes both
 * mutation and layout observation methods.
 */
export type ViewMutationApi = ViewApi;

/**
 * Developer-only hooks for optional runtime inspection tools.
 *
 * These hooks expose internal runtime objects and are not intended for normal
 * visualization control or persisted application state.
 */
export interface EmbedDebugApi {
    /**
     * Returns the internal root view for optional developer tooling.
     */
    getViewRoot: () => object | undefined;

    /**
     * Loads Core debug helpers from the same runtime that owns the view tree.
     */
    getModules: () => Promise<typeof import("../debug/index.js")>;

    /**
     * Creates a detached logical-pixel visualization of the Canvas software
     * picking IDs. Available only in Core embeds using the Canvas renderer.
     */
    createPickingBufferVisualization?: () => HTMLCanvasElement | undefined;
}

// Design intent: EmbedResult.datasets and ViewHandle.datasets use the same
// exact-owner model. The embed-level namespace is a convenience capability for
// datasets declared by the top-level authored specification; it deliberately
// bypasses an implicit layout root and never searches descendants by name.
// Nested declarations require their owning ViewHandle. This top-level/scoped
// split is intended to extend to parameters when they gain a view-scoped API;
// the existing flat getParam() lookup remains separate for compatibility.

export interface ImageExportOptions {
    /** Custom width in CSS pixels. Defaults to canvas width. */
    logicalWidth?: number;

    /** Custom height in CSS pixels. Defaults to canvas height. */
    logicalHeight?: number;

    /** Overrides the visualization background. Null is transparent. */
    background?: string | null;
}

export interface RasterExportOptions extends ImageExportOptions {
    /** Output MIME type. __Default value:__ `"image/png"` */
    mimeType?: "image/png";

    /** Physical image pixels per logical CSS pixel. Defaults to the device pixel ratio. */
    pixelRatio?: number;
}

export interface RasterExportResult {
    /** The exported raster image. */
    blob: Blob;
}

export interface SvgExportOptions extends ImageExportOptions {
    /** Rasterizes dense mark layers using an available rendering backend. */
    rasterization?: SvgRasterizationOptions;
}

export interface SvgRasterizationOptions {
    /** Rasterize a mark when its visible instance count is larger than this. */
    maxVectorInstances: number;

    /** Physical raster pixels per logical SVG pixel. __Default value:__ `2` */
    pixelRatio?: number;
}

export interface SvgRasterizationTargetInfo {
    /** Mark type included in the raster image. */
    markType: string;

    /** Number of visible instances across all rendered facets. */
    instanceCount: number;
}

export interface SvgRasterizationInfo {
    /** Contiguous mark layers combined into this raster image. */
    targets: SvgRasterizationTargetInfo[];

    /** Why the layers were rasterized. */
    reason: "instance-threshold";

    /** Threshold used for this export. */
    maxVectorInstances: number;

    /** Physical raster pixels per logical SVG pixel. */
    pixelRatio: number;
}

export interface SvgExportResult {
    /** The exported SVG document. */
    blob: Blob;

    /** Unsupported properties that were ignored during export. */
    warnings: string[];

    /** Raster images embedded in the SVG, in paint order. */
    rasterized: SvgRasterizationInfo[];
}

export interface SvgExportAnalysisOptions {
    /** Custom width in CSS pixels. Defaults to canvas width. */
    logicalWidth?: number;

    /** Custom height in CSS pixels. Defaults to canvas height. */
    logicalHeight?: number;
}

export interface SvgExportLayerInfo {
    /** Name of the UnitView that owns the mark. */
    viewName: string;

    /** Resolved title of the UnitView, when available. */
    viewTitle?: string;

    /** Current path of the UnitView, for display and diagnostics only. */
    viewPath: string;

    /** Mark type rendered by the layer. */
    markType: string;

    /** Number of instances that SVG export would emit after culling. */
    instanceCount: number;
}

export interface SvgExportAnalysis {
    /** Visible mark layers in their first-seen rendering order. */
    layers: SvgExportLayerInfo[];
}

/** Exports the current visualization as raster or vector images. */
export interface ImageExportApi {
    /**
     * Exports a raster image through an available rendering backend. PNG is
     * currently the only supported format. Rejects if rasterization is
     * unavailable.
     */
    raster: (options?: RasterExportOptions) => Promise<RasterExportResult>;

    /** Exports editable SVG arranged according to the view hierarchy. */
    svg: (options?: SvgExportOptions) => Promise<SvgExportResult>;

    /** Counts visible SVG mark instances without creating an image. */
    analyzeSvg: (
        options?: SvgExportAnalysisOptions
    ) => Promise<SvgExportAnalysis>;
}

/**
 * An API for controlling the embedded GenomeSpy instance.
 */
export interface EmbedResult {
    /**
     * Inspects and controls the live view hierarchy.
     */
    views: ViewApi;

    /**
     * Updates datasets declared by the top-level input specification.
     *
     * The dataset must be declared in that specification's `datasets`
     * property.
     *
     * This namespace is unaffected by implicit layout wrappers and does not
     * search nested views.
     */
    readonly datasets: DatasetApi;

    /** Synchronous native input subscriptions for the embedded canvas. */
    readonly events: EmbedEventApi;

    /** Parameters and selections resolved from the authored top-level scope. */
    readonly params: ParamNamespace;

    /**
     * Exports the current visualization as raster or vector images.
     */
    readonly imageExport: ImageExportApi;

    /**
     * Developer-only hooks for optional runtime inspection tools.
     */
    debug: EmbedDebugApi;

    /**
     * Releases all resources and unregisters event listeners, etc.
     */
    finalize: () => void;

    /**
     * Adds an event listener, which is called when the user interacts with a mark
     * instance. Currently, only `"click"` events are supported. The callback receives
     * an event object as its first (and only) parameter. Its `datum` property
     * contains the datum that the user interacted with.
     */
    addEventListener: (type: string, listener: (event: any) => void) => void;

    /**
     * Removes a registered event listener.
     */
    removeEventListener: (type: string, listener: (event: any) => void) => void;

    /**
     * Returns a named `ScaleResolution` object that allows for attaching event
     * listeners and controlling the scale domain. Returns `undefined` when the
     * name is not registered.
     */
    getScaleResolutionByName: (name: string) => ScaleResolutionApi | undefined;

    /**
     * Returns a handle for reading, writing, and subscribing to a named
     * parameter.
     *
     * Parameters are addressed by name only. If the name resolves to multiple
     * independent parameters, this method throws an ambiguity error. Parameters
     * declared with `push: "outer"` are treated as aliases of the outer
     * parameter they write to.
     */
    getParam: <T = ParamValue>(name: string) => ParamApi<T>;

    /**
     * Waits until lazy data sources have loaded data for the current visible
     * positional domain.
     */
    awaitVisibleLazyData: (signal?: AbortSignal) => Promise<void>;

    /**
     * Updates a named dataset
     *
     * @param name data source to update
     * @param data new data. If left undefined, the data is retrieved from a provider.
     * @deprecated Use `EmbedResult.datasets` for a top-level declaration or
     * `ViewHandle.datasets` for a nested declaration.
     */
    updateNamedData: (name: string, data?: any[]) => void;

    /**
     * Returns the bounds reached by the last rendered layout in CSS pixels.
     */
    getRenderedBounds: () => {
        width: number | undefined;
        height: number | undefined;
    };

    /**
     * Returns the current logical canvas size in CSS pixels.
     */
    getLogicalCanvasSize: () => { width: number; height: number };

    /**
     * Returns a PNG data URL of the current canvas.
     *
     * @param {number} [logicalWidth] Custom width, defaults to canvas width
     * @param {number} [logicalHeight] Custom height, defaults to canvas height
     * @param {number} [devicePixelRatio] Defaults to window.devicePixelRatio
     * @param {string | null} [clearColor] Background color. A CSS color, null for transparent
     * @returns A PNG data URL
     * @deprecated Use `imageExport.raster()` instead.
     */
    exportCanvas: (
        logicalWidth?: number,
        logicalHeight?: number,
        devicePixelRatio?: number,
        clearColor?: string | null
    ) => string;
}
