import {
    getEncoderDataAccessor,
    getSecondaryChannel,
} from "../../encoder/encoder.js";
import { resolveMarkProperty } from "./markEncoding.js";
import { UNIQUE_ID_KEY } from "../../data/transforms/identifier.js";
import {
    isMultiPointSelection,
    isIntervalSelection,
    isSinglePointSelection,
} from "../../selection/selection.js";

const FADE_STEPS = 4;

/**
 * @typedef {object} NormalizedLinkArcFade
 * @prop {number} normalX
 * @prop {number} normalY
 * @prop {number} offset
 * @prop {number} start
 * @prop {number} end
 * @prop {string} key
 */

/**
 * Canonicalizes the infinite chord line so collinear links share one mask
 * regardless of endpoint order or arc height.
 *
 * @param {[number, number]} p1
 * @param {[number, number]} p4
 * @param {[number, number]} distances
 * @returns {NormalizedLinkArcFade | undefined}
 */
export function normalizeLinkArcFade(p1, p4, distances) {
    const dx = p4[0] - p1[0];
    const dy = p4[1] - p1[1];
    const length = Math.hypot(dx, dy);
    if (length == 0) {
        return undefined;
    }

    let normalX = -dy / length;
    let normalY = dx / length;
    if (normalX < 0 || (normalX == 0 && normalY < 0)) {
        normalX = -normalX;
        normalY = -normalY;
    }
    const offset = normalX * p1[0] + normalY * p1[1];
    const [start, end] = distances;
    const key = JSON.stringify([
        round(normalX, 6),
        round(normalY, 6),
        round(offset, 1),
        round(start, 1),
        round(end, 1),
    ]);

    return { normalX, normalY, offset, start, end, key };
}

/**
 * Resolves fading and the same selection membership used by the shaders.
 * @param {import("../../marks/link.js").default} mark
 * @param {string} shape
 * @returns {(datum: object) => [number, number] | false}
 */
export function createLinkFadeEncoder(mark, shape) {
    const distances = resolveMarkProperty(
        mark,
        mark.properties.arcFadingDistance
    );
    if (
        (shape != "arc" && shape != "dome") ||
        distances === false ||
        distances[0] <= 0 ||
        distances[1] <= 0
    ) {
        return () => false;
    }
    const tests =
        mark.encoders.uniqueId &&
        resolveMarkProperty(mark, mark.properties.noFadingOnPointSelection)
            ? createSelectionTests(mark)
            : [];
    return (datum) => (tests.some((test) => test(datum)) ? false : distances);
}

/**
 * Tests all selections referenced by conditional encoders with empty=false,
 * matching isDatumSelected() in GLSL and WGSL.
 *
 * @param {import("../../marks/link.js").default} mark
 * @returns {((datum: import("../../data/flowNode.js").Datum) => boolean)[]}
 */
function createSelectionTests(mark) {
    const paramNames = new Set(
        Object.values(mark.encoders)
            .flatMap((encoder) => encoder.branches)
            .map((branch) => branch.predicate.param)
            .filter((param) => param)
    );
    return Array.from(paramNames, (param) => {
        const selection =
            /** @type {import("../../types/selectionTypes.js").Selection} */ (
                mark.unitView.paramRuntime.findValue(param)
            );
        if (isSinglePointSelection(selection)) {
            return (datum) =>
                selection.uniqueId != null &&
                selection.uniqueId == datum[UNIQUE_ID_KEY];
        } else if (isMultiPointSelection(selection)) {
            return (datum) => selection.data.has(datum[UNIQUE_ID_KEY]);
        } else if (isIntervalSelection(selection)) {
            const targets = Object.entries(selection.intervals).map(
                ([channel, interval]) => {
                    if (channel != "x" && channel != "y") {
                        throw new Error(
                            `Unsupported link selection channel: ${channel}`
                        );
                    }
                    const encoder = mark.encoders[channel];
                    const secondary =
                        mark.encoders[getSecondaryChannel(channel)];
                    // GLSL tests the raw data branch, before scales and offsets.
                    const start =
                        getEncoderDataAccessor(encoder) ??
                        encoder.branches[0].accessor;
                    const end =
                        getEncoderDataAccessor(secondary) ??
                        secondary.branches[0].accessor;
                    return { interval, start, end };
                }
            );
            return (datum) =>
                targets.every(({ interval, start, end }) => {
                    if (!interval) {
                        return false;
                    }
                    const a = +start(datum);
                    const b = +end(datum);
                    // LinkMark's hit test is endpoints, not span intersection.
                    return (
                        (interval[0] <= a && a <= interval[1]) ||
                        (interval[0] <= b && b <= interval[1])
                    );
                });
        } else {
            throw new Error(
                `Unsupported link selection type: ${selection.type}`
            );
        }
    });
}

/**
 * @param {number} start
 * @param {number} end
 */
export function createFadeStops(start, end) {
    /** @type {{offset: number, opacity: number}[]} */
    const stops = [];
    const appendSide = (/** @type {boolean} */ left) => {
        for (let i = 0; i <= FADE_STEPS; i++) {
            const t = i / FADE_STEPS;
            const distance = left
                ? end + (start - end) * t
                : start + (end - start) * t;
            const position = left
                ? (end - distance) / (2 * end)
                : (end + distance) / (2 * end);
            const fadeT = (distance - start) / (end - start);
            stops.push({
                offset: position,
                opacity: 1 - smoothstep(fadeT),
            });
        }
    };

    appendSide(true);
    appendSide(false);
    return stops;
}

/** @param {number} value */
function smoothstep(value) {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
}

/** @param {number} value @param {number} digits */
function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
