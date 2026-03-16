import { Axis, GenomeAxis } from "./axis.js";
import {
    LinkProps,
    MarkPropsBase,
    PointProps,
    RectProps,
    RuleProps,
    ShadowProps,
    TickProps,
    TextProps,
} from "./mark.js";
import { Scale, SchemeParams } from "./scale.js";
import { Title } from "./title.js";

export type BuiltInThemeName =
    | "genomespy"
    | "vegalite"
    | "quartz"
    | "dark"
    | "fivethirtyeight"
    | "urbaninstitute";

export interface ViewConfig extends ShadowProps {
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

export type MarkConfig = Partial<Omit<MarkPropsBase, "type">>;

export type PointConfig = Partial<Omit<PointProps, "type">>;

export type RectConfig = Partial<Omit<RectProps, "type">>;

export type RuleConfig = Partial<Omit<RuleProps, "type">>;

export type TickConfig = Partial<Omit<TickProps, "type">>;

export type TextConfig = Partial<Omit<TextProps, "type">>;

export type LinkConfig = Partial<Omit<LinkProps, "type">>;

export type AxisConfig = Partial<Axis & GenomeAxis>;

type ColorSchemeConfig = string | SchemeParams;

export interface ScaleConfig extends Partial<Scale> {
    /**
     * Defaults for nominal scales.
     */
    nominal?: Partial<Scale>;

    /**
     * Defaults for ordinal scales.
     */
    ordinal?: Partial<Scale>;

    /**
     * Defaults for quantitative scales.
     */
    quantitative?: Partial<Scale>;

    /**
     * Defaults for GenomeSpy's `index` scales.
     */
    index?: Partial<Scale>;

    /**
     * Defaults for GenomeSpy's `locus` scales.
     */
    locus?: Partial<Scale>;

    /**
     * Default color scheme for nominal color scales.
     */
    nominalColorScheme?: ColorSchemeConfig;

    /**
     * Default color scheme for ordinal color scales.
     */
    ordinalColorScheme?: ColorSchemeConfig;

    /**
     * Default color scheme for quantitative color scales when no named range
     * such as `"heatmap"` or `"ramp"` applies.
     */
    quantitativeColorScheme?: ColorSchemeConfig;
}

export interface RangeConfig {
    /**
     * Named range for `shape` channels.
     */
    shape?: string[];

    /**
     * Named range for `size` channels.
     */
    size?: number[];

    /**
     * Named range for `angle` channels.
     */
    angle?: number[];

    /**
     * Named range for quantitative rect-like color encodings such as heatmaps.
     */
    heatmap?: ColorSchemeConfig;

    /**
     * Named range for quantitative ramp color encodings.
     */
    ramp?: ColorSchemeConfig;

    /**
     * Named range for diverging color encodings.
     */
    diverging?: ColorSchemeConfig;
}

export type TitleConfig = Partial<Omit<Title, "text">>;

type MergeProps<A, B> = {
    [K in keyof A | keyof B]:
        | (K extends keyof A ? A[K] : never)
        | (K extends keyof B ? B[K] : never);
};

type CombinedStyleConfig = MergeProps<
    MergeProps<
        MergeProps<
            MergeProps<
                MergeProps<MergeProps<MarkConfig, PointConfig>, RectConfig>,
                RuleConfig
            >,
            TickConfig
        >,
        TextConfig
    >,
    MergeProps<MergeProps<LinkConfig, AxisConfig>, TitleConfig>
>;

export type StyleConfig = Partial<CombinedStyleConfig>;

export interface GenomeSpyConfig {
    /**
     * Defaults for view background styling, including fill, stroke, and
     * shadow-related properties.
     */
    view?: ViewConfig;

    /**
     * Defaults shared by all mark types.
     */
    mark?: MarkConfig;

    /**
     * Defaults for point marks.
     */
    point?: PointConfig;

    /**
     * Defaults for rect marks.
     */
    rect?: RectConfig;

    /**
     * Defaults for rule marks.
     */
    rule?: RuleConfig;

    /**
     * Defaults for tick marks.
     */
    tick?: TickConfig;

    /**
     * Defaults for text marks.
     */
    text?: TextConfig;

    /**
     * Defaults for link marks.
     */
    link?: LinkConfig;

    /**
     * Defaults shared by all axes.
     */
    axis?: AxisConfig;

    /**
     * Defaults for x axes.
     */
    axisX?: AxisConfig;

    /**
     * Defaults for y axes.
     */
    axisY?: AxisConfig;

    /**
     * Defaults for top-oriented axes.
     */
    axisTop?: AxisConfig;

    /**
     * Defaults for bottom-oriented axes.
     */
    axisBottom?: AxisConfig;

    /**
     * Defaults for left-oriented axes.
     */
    axisLeft?: AxisConfig;

    /**
     * Defaults for right-oriented axes.
     */
    axisRight?: AxisConfig;

    /**
     * Defaults for axes that visualize nominal data.
     */
    axisNominal?: AxisConfig;

    /**
     * Defaults for axes that visualize ordinal data.
     */
    axisOrdinal?: AxisConfig;

    /**
     * Defaults for axes that visualize quantitative data.
     */
    axisQuantitative?: AxisConfig;

    /**
     * Defaults for axes that visualize GenomeSpy `index` scales.
     */
    axisIndex?: AxisConfig;

    /**
     * Defaults for axes that visualize GenomeSpy `locus` scales.
     */
    axisLocus?: AxisConfig;

    /**
     * Defaults for scale behavior and scale-type-specific buckets.
     */
    scale?: ScaleConfig;

    /**
     * Named reusable ranges for channels such as `shape`, `size`, and color.
     */
    range?: RangeConfig;

    /**
     * Defaults for view titles.
     */
    title?: TitleConfig;

    /**
     * Named reusable style buckets that marks, axes, titles, and views can
     * reference through their `style` properties.
     */
    style?: Record<string, StyleConfig>;
}
