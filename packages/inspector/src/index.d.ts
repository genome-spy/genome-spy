/**
 * Runtime hooks used by the inspector to read a live GenomeSpy view hierarchy.
 */
export interface InspectorHost {
    /**
     * Returns the current internal root view.
     *
     * Core embed results expose this through `api.debug.getViewRoot()`.
     */
    getViewRoot(): object | undefined;

    /**
     * Loads Core debug modules from the same runtime bundle as the inspected
     * view hierarchy. App provides this to avoid loading a second Core copy.
     */
    getModules(): Promise<InspectorDebugModules>;
}

/**
 * Core debug helpers used by the inspector session.
 */
export type InspectorDebugModules =
    typeof import("@genome-spy/core/debug/index.js");

/**
 * Maintains inspector state for one embedded GenomeSpy runtime.
 */
export declare class InspectorSession extends EventTarget {
    constructor(host: InspectorHost);

    /**
     * Whether generated chrome views are included in view snapshots.
     */
    readonly includeChrome: boolean;

    /**
     * Latest serializable debug snapshot rendered by the inspector panel.
     */
    snapshot: any;

    /**
     * Sets whether generated chrome views are included and refreshes the snapshot.
     */
    setIncludeChrome(includeChrome: boolean): Promise<void>;

    /**
     * Rebuilds the inspector snapshot from the current live runtime.
     */
    refresh(): Promise<void>;

    /**
     * Highlights a view by its runtime view id.
     */
    highlightView(viewId: string | undefined): void;

    /**
     * Releases inspector listeners and clears active highlights.
     */
    dispose(): void;
}

/**
 * Creates an embeddable inspector panel and its backing session.
 */
export declare function createInspectorPanel(
    host: InspectorHost,
    options?: {
        /**
         * Inspector tab to show first, such as `"elements"` or `"dataflow"`.
         */
        activePanel?: string;
    }
): Promise<{
    /**
     * Custom element that renders the inspector UI.
     */
    panel: HTMLElement;

    /**
     * Session backing the panel.
     */
    session: InspectorSession;

    /**
     * Disposes the session and removes the panel from the DOM.
     */
    dispose(): void;
}>;

/**
 * Attaches the inspector as a fixed-position overlay.
 */
export declare function attachInspectorOverlay(
    host: InspectorHost,
    options?: {
        /**
         * Container where the overlay is appended. Defaults to `document.body`.
         */
        container?: HTMLElement;

        /**
         * CSS width for the overlay. Defaults to `min(46vw, 760px)`.
         */
        width?: string;

        /**
         * Inspector tab to show first, such as `"elements"` or `"dataflow"`.
         */
        activePanel?: string;
    }
): Promise<{
    /**
     * Fixed-position overlay element that contains the inspector panel.
     */
    element: HTMLElement;

    /**
     * Custom element that renders the inspector UI.
     */
    panel: HTMLElement;

    /**
     * Session backing the panel.
     */
    session: InspectorSession;

    /**
     * Disposes the session and removes the overlay from the DOM.
     */
    dispose(): void;
}>;

/**
 * Creates the App plugin that adds the inspector to GenomeSpy App.
 */
export declare function appInspector(options?: {
    /**
     * Preferred App side-panel width.
     */
    preferredWidth?: string;
}): any;

/**
 * @deprecated Use `appInspector`.
 */
export declare const genomeSpyInspector: typeof appInspector;
