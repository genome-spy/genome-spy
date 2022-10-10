import { ScaleResolutionApi } from "./view/scaleResolutionApi";
import { TooltipHandler } from "./tooltip/tooltipHandler";
import { RootSpec } from "./spec/root";
import { Datum } from "./data/flowNode";

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
     * A function that allows retrieval of named data sources.
     *
     * TODO: Support dynamic updates, i.e., pushing new data.
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
     * Returns a named _ScaleResolution_ object that allows for attaching event
     * listeners and controlling the scale domain.
     */
    getScaleResolutionByName: (name: string) => ScaleResolutionApi;

    /**
     * Updates a named dataset
     */
    updateNamedData: (name: string, data: Datum[]) => void;
}
