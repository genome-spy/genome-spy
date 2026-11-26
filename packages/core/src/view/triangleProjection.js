import { splitAccessPath } from "vega-util";
import { supportsGridCoordinates } from "../scales/scaleRules.js";
import { inheritSpecOrigin } from "../utils/specOrigin.js";
import ViewError from "./viewError.js";
import { isInChromeSubtree } from "./viewChrome.js";
import { isUnitSpec } from "./viewSpecGuards.js";

/** @typedef {import("../spec/view.js").ViewSpec} ViewSpec */
/** @typedef {import("./view.js").default} View */
/** @typedef {import("../spec/channel.js").PositionDef | import("../spec/channel.js").Position2Def} Position */
/** @typedef {"locus" | "index" | "quantitative"} MatrixCoordinateType */

const coordinateTypes = ["locus", "index", "quantitative"];
const endpointMarks = new Set(["rule", "arrow", "link"]);
export const TRIANGLE_ASPECT_PARAM = "__trianglePlotAspect";

/**
 * Find the closest authored projection, including an explicit opt-out.
 * @param {View} [view]
 */
function getProjectionOwner(view) {
    if (view && isInChromeSubtree(view)) return;
    for (; view; view = view.dataParent) {
        if (getViewProjection(view.spec) !== undefined) return view;
    }
}

/** @param {ViewSpec} [spec] */
function getViewProjection(spec) {
    return spec && "projection" in spec ? spec.projection : undefined;
}

/**
 * Return null for Cartesian coordinates and undefined for inheritance.
 * @param {ViewSpec} [spec]
 * @returns {"up" | "down" | null | undefined}
 */
export function getTriangleDirection(spec) {
    const projection = getViewProjection(spec);
    if (projection === undefined) return;
    if (projection === null) return null;
    if (projection === "triangle") return "up";
    if (projection.type === "triangle") {
        const { direction } = projection;
        if (direction === "up" || direction === "down") return direction;
    }
    throw new Error("Unknown view projection: " + JSON.stringify(projection));
}

/**
 * @param {View} [view]
 * @param {"triangle"} [legacyProjection]
 * @returns {"up" | "down" | undefined}
 */
export function getResolvedTriangleDirection(view, legacyProjection) {
    const owner = getProjectionOwner(view);
    if (owner) return getTriangleDirection(owner.spec) ?? undefined;
    if (legacyProjection === "triangle") return "up";
}

/**
 * Lower the view projection to raster geometry and ordinary position encodings.
 * Raster cells and vector marks use the same signed separation, so clipping the
 * plot at its baseline retains the same half of the matrix in both paths.
 * @param {ViewSpec} spec
 * @param {View} [dataParent]
 * @param {boolean} [inheritEncoding]
 * @returns {ViewSpec}
 */
export function normalizeTriangleProjection(spec, dataParent, inheritEncoding) {
    const direction = getTriangleDirection(spec);
    if (
        direction === null ||
        (!direction && !getResolvedTriangleDirection(dataParent))
    ) {
        return spec;
    }

    const projected = inheritSpecOrigin(spec, { ...spec });
    if (direction) {
        projected.scales = {
            ...spec.scales,
            y: {
                type: "linear",
                domain: {
                    expr: `${TRIANGLE_ASPECT_PARAM} > 0 ? [0, 2 * ${TRIANGLE_ASPECT_PARAM} * abs(invert('x', 1) - invert('x', 0))] : [0, 1]`,
                },
                nice: false,
                clamp: false,
                reverse: direction === "down",
                round: false,
                zoom: false,
            },
        };
    } else if (spec.scales?.y) {
        projected.scales = { ...spec.scales };
        delete projected.scales.y;
    }
    if (spec.axes?.y) {
        projected.axes = { ...spec.axes };
        delete projected.axes.y;
    }

    if (!isUnitSpec(projected)) return projected;

    const mark = projected.mark;
    const markType = typeof mark === "string" ? mark : mark.type;
    if (markType === "raster") return projected;
    if (markType === "rect" || markType === "tick") {
        throw new Error(
            `The ${markType} mark does not support triangle projection. Set projection to null to place it in the frame.`
        );
    }

    projected.mark = inheritSpecOrigin(
        typeof mark === "object" ? mark : spec,
        /** @type {import("../spec/mark.js").MarkProps} */ ({
            ...(typeof mark === "string" ? { type: mark } : mark),
            clip: true,
        })
    );
    const { x, y, x2, y2 } = {
        ...(inheritEncoding && dataParent?.getEncoding()),
        ...spec.encoding,
    };
    if (!x || !("type" in x) || !coordinateTypes.includes(x.type)) {
        throw new Error(
            "Triangle projection requires an x encoding of type locus, index, or quantitative."
        );
    }
    const coordinateType = /** @type {MatrixCoordinateType} */ (x.type);
    /** @type {Set<string>} */
    const coordinates = new Set();
    const [midpoint, separation] = positionExpressions(
        x,
        y,
        coordinateType,
        coordinates
    );
    projected.encoding = {
        ...spec.encoding,
        x: inheritSpecOrigin(x, {
            type: coordinateType,
            expr: midpoint,
            band: 0,
            buildIndex: false,
            axis: x.axis,
            scale: "scale" in x ? x.scale : undefined,
            title: x.title ?? null,
        }),
        y: inheritSpecOrigin(y, {
            type: "quantitative",
            expr: separation,
            axis: null,
        }),
    };
    if (endpointMarks.has(markType) || (markType === "text" && (x2 || y2))) {
        const link = markType === "link";
        if (!link && !x2 && !y2) {
            throw new Error(
                `A projected ${markType} requires an x2 or y2 endpoint.`
            );
        }
        // A link with an omitted endpoint component uses datum zero.
        const endX = x2 ?? (link ? { datum: 0 } : x);
        const endY = y2 ?? (link ? { datum: 0 } : y);
        const [endMidpoint, endSeparation] = positionExpressions(
            endX,
            endY,
            coordinateType,
            coordinates
        );
        projected.encoding.x2 = inheritSpecOrigin(x2 ?? x, {
            expr: endMidpoint,
            band: 0,
        });
        projected.encoding.y2 = inheritSpecOrigin(y2 ?? y, {
            expr: endSeparation,
        });
    }
    // Filter before encoding. Index buffers require numeric values, and
    // arithmetic on null or strings can manufacture an otherwise valid locus.
    projected.transform = [
        ...(spec.transform ?? []),
        {
            type: "filter",
            expr: Array.from(
                coordinates,
                (coord) => `isNumber(${coord}) && isFinite(${coord})`
            ).join(" && "),
        },
    ];
    return projected;
}

/**
 * @param {Position} x
 * @param {Position} y
 * @param {MatrixCoordinateType} type
 * @param {Set<string>} coordinates
 */
function positionExpressions(x, y, type, coordinates) {
    const column = coordinateExpression(x, type, "x");
    const row = coordinateExpression(y, type, "y");
    coordinates.add(column);
    coordinates.add(row);
    const midpoint = `(${column} + ${row}) / 2`;
    return [
        type === "quantitative" ? midpoint : `floor(${midpoint})`,
        `${row} - ${column}`,
    ];
}

/**
 * @param {Position} def
 * @param {MatrixCoordinateType} type
 * @param {"x" | "y"} channel
 */
function coordinateExpression(def, type, channel) {
    if (
        def &&
        !("condition" in def) &&
        (!("type" in def) || def.type === undefined || def.type === type) &&
        (!("scale" in def) || def.scale !== null)
    ) {
        if ("field" in def) return datumField(def.field);
        if ("expr" in def) return `(${def.expr})`;
        if ("chrom" in def && type === "locus") {
            const chrom = datumField(def.chrom);
            const pos = def.pos ? datumField(def.pos) : "0";
            return `(isValid(${chrom}) && isNumber(${pos}) && isFinite(${pos}) ? linearize('x', {chrom: ${chrom}, pos: ${pos} - ${def.offset ?? 0}}) : null)`;
        }
        if ("datum" in def) {
            if (typeof def.datum === "number") return JSON.stringify(def.datum);
            if (
                type === "locus" &&
                def.datum &&
                typeof def.datum === "object" &&
                "chrom" in def.datum
            ) {
                return `linearize('x', ${JSON.stringify(def.datum)})`;
            }
        }
    }
    throw new Error(
        `Triangle projection needs a ${type} coordinate on ${channel}. Use projection: null for frame-relative positions.`
    );
}

/** @param {string} field */
function datumField(field) {
    return (
        "datum" +
        splitAccessPath(field)
            .map((part) => `[${JSON.stringify(part)}]`)
            .join("")
    );
}

/**
 * Validate resolved scales after attaching view-level scale properties.
 * @param {import("./unitView.js").default} view
 */
export function validateTriangleProjection(view) {
    const owner = getProjectionOwner(view);
    if (!owner || !getTriangleDirection(owner.spec)) return;

    const x = view.getScaleResolution("x");
    if (!x || x !== owner.getScaleResolution("x")) {
        throw new ViewError(
            "Triangle projection requires one shared x scale.",
            view
        );
    }
    validateTriangleScale(x.getScale(), view);
    if (
        view.getMarkType() !== "raster" &&
        view.getScaleResolution("y") !== owner.getScaleResolution("y")
    ) {
        throw new ViewError(
            "Triangle projection uses one derived y scale.",
            view
        );
    }
}

/**
 * @param {import("../types/encoder.js").VegaScale} scale
 * @param {View} view
 */
export function validateTriangleScale(scale, view) {
    if (
        !supportsGridCoordinates(scale) ||
        scale.domain().length !== 2 ||
        scale.props.clamp ||
        scale.props.round
    ) {
        throw new ViewError(
            "Triangle projection requires an unrounded, unclamped linear scale or an unpadded index or locus scale without gaps.",
            view
        );
    }
}
