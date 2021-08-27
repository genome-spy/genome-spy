import { Tooltip } from "./tooltip";

export interface MarkConfig {
    type: string;

    /** Whether the mark should be clipped to the UnitView's rectangle.  */
    clip?: boolean;
    align?: string;
    baseline?: string;
    dx?: number;
    dy?: number;
    xOffset?: number;
    yOffset?: number;

    tooltip?: Tooltip;

    // Rect related stuff.
    minOpacity?: number;
    minWidth?: number;
    minHeight?: number;

    // Rule related stuff.
    minLength?: number;
    strokeDash?: number[];
    strokeDashOffset?: number[];
    strokeCap?: "butt" | "square" | "round";

    // Point related stuff.
    strokeWidth?: number;
    gradientStrength?: number;
    minAbsolutePointDiameter?: number;
    semanticZoomFraction?: number;

    // TODO: get rid of this
    dynamicData?: boolean;

    /**
     * Minimum size for WebGL buffers (number of data items).
     * Allows for using bufferSubData to update graphics.
     * This property is intended for internal usage.
     */
    minBufferSize?: number;

    /**
     * Builds and index for efficient rendering of subsets of the data.
     * The data must be sorted by the x coordinate.
     *
     * TODO: This should be enabled automatically if the data are sorted.
     */
    buildIndex?: boolean;
}
