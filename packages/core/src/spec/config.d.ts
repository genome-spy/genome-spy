import { Axis, GenomeAxis } from "./axis.js";
import {
    LinkProps,
    MarkPropsBase,
    PointProps,
    RectProps,
    RuleProps,
    ShadowProps,
    TextProps,
} from "./mark.js";
import { Scale, SchemeParams } from "./scale.js";
import { Title } from "./title.js";

export type BuiltInThemeName = "genomespy" | "vegalite";

export interface ViewConfig extends ShadowProps {
    fill?: string;
    fillOpacity?: number;
    stroke?: string;
    strokeWidth?: number;
    strokeOpacity?: number;
}

export type MarkConfig = Partial<Omit<MarkPropsBase, "type">>;

export type PointConfig = Partial<Omit<PointProps, "type">>;

export type RectConfig = Partial<Omit<RectProps, "type">>;

export type RuleConfig = Partial<Omit<RuleProps, "type">>;

export type TextConfig = Partial<Omit<TextProps, "type">>;

export type LinkConfig = Partial<Omit<LinkProps, "type">>;

export type AxisConfig = Partial<Axis & GenomeAxis>;

type ColorSchemeConfig = string | SchemeParams;

export interface ScaleConfig extends Partial<Scale> {
    nominal?: Partial<Scale>;
    ordinal?: Partial<Scale>;
    quantitative?: Partial<Scale>;
    index?: Partial<Scale>;
    locus?: Partial<Scale>;

    nominalColorScheme?: ColorSchemeConfig;
    ordinalColorScheme?: ColorSchemeConfig;
    quantitativeColorScheme?: ColorSchemeConfig;
}

export interface RangeConfig {
    shape?: string[];
    size?: number[];
    angle?: number[];
    heatmap?: ColorSchemeConfig;
    ramp?: ColorSchemeConfig;
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
            MergeProps<MergeProps<MarkConfig, PointConfig>, RectConfig>,
            RuleConfig
        >,
        TextConfig
    >,
    MergeProps<MergeProps<LinkConfig, AxisConfig>, TitleConfig>
>;

export type StyleConfig = Partial<CombinedStyleConfig>;

export interface GenomeSpyConfig {
    view?: ViewConfig;

    mark?: MarkConfig;
    point?: PointConfig;
    rect?: RectConfig;
    rule?: RuleConfig;
    text?: TextConfig;
    link?: LinkConfig;

    axis?: AxisConfig;
    axisX?: AxisConfig;
    axisY?: AxisConfig;
    axisTop?: AxisConfig;
    axisBottom?: AxisConfig;
    axisLeft?: AxisConfig;
    axisRight?: AxisConfig;
    axisNominal?: AxisConfig;
    axisOrdinal?: AxisConfig;
    axisQuantitative?: AxisConfig;
    axisIndex?: AxisConfig;
    axisLocus?: AxisConfig;

    scale?: ScaleConfig;
    range?: RangeConfig;

    title?: TitleConfig;

    style?: Record<string, StyleConfig>;
}
