import { createSvgElement } from "../svgElement.js";
import {
    getBezierPoints,
    resolveLinkProperties,
    visitLinkInstances,
} from "../../rendering/cpu/link.js";
import {
    createSvgAttributeEncoder,
    formatSvgNumber,
    resolveSvgProperty,
    toSvgString,
} from "../svgMarkUtils.js";
import { UNIQUE_ID_KEY } from "../../data/transforms/identifier.js";
import {
    isMultiPointSelection,
    isSinglePointSelection,
} from "../../selection/selection.js";

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderLinkSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/link.js").default} */ (
        baseMark
    );
    const props = mark.properties;
    const arcFadingDistance = resolveSvgProperty(mark, props.arcFadingDistance);
    const properties = resolveLinkProperties(mark);
    const { coords, data, group, viewOpacity, visibleBounds } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const noFadingOnPointSelection = resolveSvgProperty(
        mark,
        props.noFadingOnPointSelection
    );
    const pointSelections = noFadingOnPointSelection
        ? getPointSelections(mark, encoders)
        : [];
    const encodeStyles = createSvgAttributeEncoder(group, {
        stroke: { encoder: encoders.color, transform: toSvgString },
        "stroke-opacity": {
            encoder: encoders.opacity,
            transform: (value) => +value * viewOpacity,
        },
        "stroke-width": {
            encoder: encoders.size,
            transform: (value) => formatSvgNumber(+value),
        },
    });
    group.setAttribute("fill", "none");
    group.setAttribute("stroke-linecap", "butt");
    return visitLinkInstances(
        mark,
        properties,
        { coords, data, visibleBounds },
        ({ datum, points }) => {
            const [p1, p2, p3, p4] = points;
            if (options.countOnly) {
                return;
            }
            /** @type {Record<string, string | number>} */
            const styles = encodeStyles(datum);
            if (
                properties.shape == "arc" &&
                arcFadingDistance !== false &&
                arcFadingDistance[0] > 0 &&
                arcFadingDistance[1] > 0 &&
                !isDatumSelected(datum, pointSelections)
            ) {
                const mask = options.getLinkArcFadeMaskUrl({
                    p1: /** @type {[number, number]} */ (p1),
                    p4: /** @type {[number, number]} */ (p4),
                    distances: arcFadingDistance,
                });
                if (mask) {
                    styles.mask = mask;
                }
            }
            group.appendChild(
                createSvgElement("path", {
                    d: `M ${formatSvgPoint(p1)} C ${formatSvgPoint(p2)} ${formatSvgPoint(p3)} ${formatSvgPoint(p4)}`,
                    ...styles,
                })
            );
        }
    );
}

/**
 * Resolves only point selections referenced by the mark's conditional
 * encoders, matching the set used by the shader's isPointSelected().
 *
 * @param {import("../../marks/link.js").default} mark
 * @param {Record<string, import("../../types/encoder.js").Encoder>} encoders
 */
function getPointSelections(mark, encoders) {
    const paramNames = new Set(
        Object.values(encoders)
            .flatMap((encoder) => encoder.branches)
            .map((branch) => branch.predicate?.param)
            .filter((param) => param)
    );
    return Array.from(paramNames)
        .map((param) => mark.unitView.paramRuntime.findValue(param))
        .filter(
            (selection) =>
                selection &&
                (isSinglePointSelection(selection) ||
                    isMultiPointSelection(selection))
        );
}

/**
 * @param {import("../../data/flowNode.js").Datum} datum
 * @param {(import("../../types/selectionTypes.js").SinglePointSelection | import("../../types/selectionTypes.js").MultiPointSelection)[]} selections
 */
function isDatumSelected(datum, selections) {
    const id = datum[UNIQUE_ID_KEY];
    return selections.some((selection) =>
        isSinglePointSelection(selection)
            ? selection.uniqueId != null && selection.uniqueId == id
            : selection.data.has(id)
    );
}

/** @param {number[]} point */
function formatSvgPoint(point) {
    return point.map(formatSvgNumber).join(" ");
}

export { getBezierPoints };
