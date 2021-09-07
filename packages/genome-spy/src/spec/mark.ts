import { Tooltip } from "./tooltip";

export type MarkType = "rect" | "point" | "rule" | "text" | "link";

// TODO: Mark-specific configs
export interface MarkConfig {
    // Channels.
    x?: number;
    x2?: number;
    y?: number;
    y2?: number;
    color?: string;
    color2?: string;
    fill?: string;
    stroke?: string;
    opacity?: number;
    fillOpacity?: number;
    strokeOpacity?: number;
    size?: number;
    size2?: number;
    shape?: string;
    text?: string;

    /** Whether the `color` represents the `fill` color (`true`) or the `stroke` color (`false`) */
    filled?: boolean;

    /** Whether the mark should be clipped to the UnitView's rectangle.  */
    clip?: boolean;
    xOffset?: number;
    yOffset?: number;

    tooltip?: Tooltip;

    // Rect related stuff.
    minOpacity?: number;
    minWidth?: number;
    minHeight?: number;

    cornerRadius?: number;
    cornerRadiusTopLeft?: number;
    cornerRadiusTopRight?: number;
    cornerRadiusBottomLeft?: number;
    cornerRadiusBottomRight?: number;

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

    // Text related stuff.
    font?: string;
    fontStyle?: "normal" | "italic";
    fontWeight?:
        | number
        | "thin"
        | "light"
        | "regular"
        | "normal"
        | "medium"
        | "bold"
        | "black";
    align?: "left" | "center" | "right";
    baseline?: "top" | "middle" | "bottom" | "alphabetic";
    dx?: number;
    dy?: number;
    fitToBand?: boolean;
    angle?: number;
    squeeze: boolean;
    paddingX: number;
    paddingY: number;
    flushX: number;
    flushY: number;
    /** Stretch letters so that they can be used with sequence logos etc... */
    logoLetters: boolean;
    viewportEdgeFadeWidth: number[];
    viewportEdgeFadeDistance: number[];

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

export interface MarkConfigAndType extends MarkConfig {
    type: MarkType;
}
