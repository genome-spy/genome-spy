import { ShadowProps } from "./mark.js";

export interface ZIndexProps {
    /**
     * Z-order relative to the view content.
     *
     * Values greater than `0` render after the view marks. Values less than or
     * equal to `0` render before the marks.
     * The default value depends on the element type.
     */
    zindex?: number;
}

export interface StrokeZIndexProps {
    /**
     * Z-order of the stroke relative to the view content.
     *
     * Values greater than `0` render the stroke after the view marks. Values
     * less than or equal to `0` render before the marks.
     * The default value depends on the element type.
     */
    strokeZindex?: number;
}

export interface ViewBackgroundProps
    extends ShadowProps, ZIndexProps, StrokeZIndexProps {
    /**
     * Fill color of the view background.
     */
    fill?: string;

    /**
     * Opacity of the view background fill.
     */
    fillOpacity?: number;

    /**
     * Stroke color of the view background.
     */
    stroke?: string;

    /**
     * Stroke width of the view background border.
     */
    strokeWidth?: number;

    /**
     * Opacity of the view background stroke.
     */
    strokeOpacity?: number;
}
