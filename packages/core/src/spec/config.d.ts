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
import { Scale } from "./scale.js";
import { Title } from "./title.js";

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

export interface ScaleConfig extends Partial<Scale> {
    nominal?: Partial<Scale>;
    ordinal?: Partial<Scale>;
    quantitative?: Partial<Scale>;
    index?: Partial<Scale>;
    locus?: Partial<Scale>;

    nominalColorScheme?: string;
    ordinalColorScheme?: string;
    quantitativeColorScheme?: string;
    indexColorScheme?: string;
    locusColorScheme?: string;
}

export interface RangeConfig {
    shape?: string[];
    size?: number[];
    angle?: number[];
}

export type TitleConfig = Partial<Omit<Title, "text">>;

export type StyleConfig = Partial<MarkConfig & AxisConfig & TitleConfig>;

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
