import {
    LINK_MARK_DEFAULTS,
    MARK_DEFAULTS,
    POINT_MARK_DEFAULTS,
    RECT_MARK_DEFAULTS,
    RULE_MARK_DEFAULTS,
    TICK_MARK_DEFAULTS,
    TEXT_MARK_DEFAULTS,
} from "./defaults/markDefaults.js";
import { AXIS_DEFAULTS, LOCUS_AXIS_DEFAULTS } from "./defaults/axisDefaults.js";
import { RANGE_DEFAULTS, SCALE_DEFAULTS } from "./defaults/scaleDefaults.js";
import {
    TITLE_DEFAULTS,
    TITLE_STYLE_DEFAULTS,
} from "./defaults/titleDefaults.js";
import { VIEW_DEFAULTS } from "./defaults/viewDefaults.js";

/** @type {import("../spec/config.js").GenomeSpyConfig} */
export const INTERNAL_DEFAULT_CONFIG = {
    view: VIEW_DEFAULTS,

    mark: MARK_DEFAULTS,
    point: POINT_MARK_DEFAULTS,
    rect: RECT_MARK_DEFAULTS,
    rule: RULE_MARK_DEFAULTS,
    tick: TICK_MARK_DEFAULTS,
    text: TEXT_MARK_DEFAULTS,
    link: LINK_MARK_DEFAULTS,

    axis: AXIS_DEFAULTS,
    axisLocus: LOCUS_AXIS_DEFAULTS,

    scale: SCALE_DEFAULTS,
    range: RANGE_DEFAULTS,

    title: TITLE_DEFAULTS,
    style: TITLE_STYLE_DEFAULTS,
};
