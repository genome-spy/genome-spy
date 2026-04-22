/**
 * Structured view address used by selectors.
 */
export interface ViewSelector {
    scope: string[];
    view: string;
}

/**
 * Structured parameter address used by selectors.
 */
export interface ParamSelector {
    scope: string[];
    param: string;
}
