import { ScaleResolutionApi } from "./scaleResolutionApi";
import { TooltipHandler } from "../tooltip/tooltipHandler";
import { RootSpec } from "../spec/root";

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
}

/**
 * An API for controlling the embedded GenomeSpy instance.
 */
export interface EmbedResult {
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
     * Updates a named dataset
     *
     * @param name data source to update
     * @param data new data. If left undefined, the data is retrieved from a provider.
     */
    updateNamedData: (name: string, data?: any[]) => void;
}
