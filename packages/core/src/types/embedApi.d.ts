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
) => EmbedResult;

export interface EmbedOptions {
    /**
     * A function that allows retrieval of named data. There are two ways to provide named data:
     * 1. A data provider (this)
     * 2. Explicit updates using the `updateNamedData` method (the other).
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
     * A suggestion for the browser on the appropriate GPU setup for the WebGL environment.
     * Defaults to "default" in the @genome-spy/core package and "high-performance" in the
     * @genome-spy/app package.
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
 * - Point selections are readable as runtime values but are not supported for
 *   writes through the initial API because valid values require
 *   GenomeSpy-generated datum ids.
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
 * Address of a view in the live layout hierarchy.
 *
 * Use a `ViewSelector` for durable references to named views within import or
 * insertion scopes. Use a `ViewHandle` for views returned by this API,
 * including anonymous views. Use `"root"` to address the root view.
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
 * Live handle to a view in the embedded GenomeSpy instance.
 *
 * The exposed hierarchy matches the layout tree derived from the
 * visualization spec: unit views and container views are represented as view
 * handles, and child order is the layout order declared by the spec.
 * GenomeSpy may add an implicit root layout container, for example when a
 * root unit view needs space for axes, titles, or other guides.
 *
 * Handles are opaque public references. They do not expose internal `View`
 * objects, and callers should check `isAlive()` before reusing a handle after
 * mutations that may have removed its subtree.
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
}

/**
 * API for mutating the live layout hierarchy.
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
export interface ViewMutationApi {
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
     * Returns `undefined` when the address cannot be resolved or when a handle
     * no longer refers to a live view.
     */
    resolve: (address: ViewAddress) => ViewHandle | undefined;

    /**
     * Resolves an address to a live view handle.
     *
     * Throws if the address cannot be resolved or if a handle no longer refers
     * to a live view.
     */
    get: (address: ViewAddress) => ViewHandle;

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
        callback: (views: ViewMutationApi) => T | Promise<T>
    ) => Promise<T>;
}

/**
 * An API for controlling the embedded GenomeSpy instance.
 */
export interface EmbedResult {
    /**
     * Controls the live view hierarchy.
     */
    views: ViewMutationApi;

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
     * listeners and controlling the scale domain.
     */
    getScaleResolutionByName: (name: string) => ScaleResolutionApi;

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
     * @param {string} [clearColor] Background color. A CSS color, null for transparent
     * @returns A PNG data URL
     */
    exportCanvas: (
        logicalWidth: number,
        logicalHeight: number,
        devicePixelRatio: number,
        clearColor: string
    ) => string;
}
