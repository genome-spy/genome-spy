import { describe, expect, it } from "vitest";
import {
    DEFAULT_COLOR,
    buildDiscreteScaleSpec,
    buildQuantitativeScaleSpec,
    parseScaleSpec,
    normalizeQuantDomainRange,
    normalizeThresholdRange,
    validateScaleState,
} from "./configureScaleDialog.js";

/**
 * @typedef {object} ScaleDialogState
 * @prop {"nominal" | "ordinal" | "quantitative"} dataType
 * @prop {"scheme" | "manual"} colorMode
 * @prop {"observed" | "explicit"} domainMode
 * @prop {"linear" | "log" | "pow" | "sqrt" | "symlog" | "threshold"} scaleType
 * @prop {string} scheme
 * @prop {number[]} quantDomain
 * @prop {string[]} quantRange
 * @prop {number | null} domainMid
 * @prop {{ domain: string, range: string }[]} domainPairs
 * @prop {number[]} thresholds
 * @prop {string[]} thresholdRange
 * @prop {boolean} unsupportedPiecewise
 */

/** @type {ScaleDialogState} */
const BASE_STATE = {
    dataType: "quantitative",
    colorMode: "scheme",
    domainMode: "observed",
    scaleType: "linear",
    scheme: "viridis",
    quantDomain: [0, 1],
    quantRange: ["#000000", "#ffffff"],
    domainMid: null,
    domainPairs: [],
    thresholds: [],
    thresholdRange: [],
    unsupportedPiecewise: false,
};

/**
 * @param {Partial<ScaleDialogState>} overrides
 * @returns {ScaleDialogState}
 */
const makeState = (overrides) => ({
    ...BASE_STATE,
    ...overrides,
});

describe("buildQuantitativeScaleSpec", () => {
    it("allows manual range with observed domain and midpoint", () => {
        const scale = buildQuantitativeScaleSpec(
            makeState({
                colorMode: "manual",
                domainMode: "observed",
                quantRange: ["#0000ff", "#cccccc", "#ff0000"],
                domainMid: 0,
            })
        );

        expect(scale).toEqual({
            type: "linear",
            domainMid: 0,
            range: ["#0000ff", "#cccccc", "#ff0000"],
        });
    });

    it("rejects manual range with midpoint when length mismatches", () => {
        const scale = buildQuantitativeScaleSpec(
            makeState({
                colorMode: "manual",
                domainMode: "observed",
                quantRange: ["#0000ff", "#ff0000"],
                domainMid: 0,
            })
        );

        expect(scale).toBeNull();
    });

    it("includes explicit domain for manual range", () => {
        const scale = buildQuantitativeScaleSpec(
            makeState({
                colorMode: "manual",
                domainMode: "explicit",
                quantDomain: [2, 8],
                quantRange: ["#123456", "#654321"],
            })
        );

        expect(scale).toEqual({
            type: "linear",
            domain: [2, 8],
            range: ["#123456", "#654321"],
        });
    });

    it("builds threshold scales with explicit domain and range", () => {
        const scale = buildQuantitativeScaleSpec(
            makeState({
                scaleType: "threshold",
                colorMode: "manual",
                domainMode: "explicit",
                thresholds: [-1, 1],
                thresholdRange: ["#0000ff", "#ffffff", "#ff0000"],
            })
        );

        expect(scale).toEqual({
            type: "threshold",
            domain: [-1, 1],
            range: ["#0000ff", "#ffffff", "#ff0000"],
        });
    });

    it("rejects threshold scale without matching range length", () => {
        const scale = buildQuantitativeScaleSpec(
            makeState({
                scaleType: "threshold",
                colorMode: "manual",
                domainMode: "explicit",
                thresholds: [0, 10],
                thresholdRange: ["#0000ff", "#ff0000"],
            })
        );

        expect(scale).toBeNull();
    });

    it("rejects unsupported piecewise scales", () => {
        const scale = buildQuantitativeScaleSpec(
            makeState({
                colorMode: "manual",
                domainMode: "explicit",
                quantDomain: [-2, -1, 0, 1],
                quantRange: ["#000000", "#333333", "#cccccc", "#ffffff"],
                unsupportedPiecewise: true,
            })
        );

        expect(scale).toBeNull();
    });
});

describe("buildDiscreteScaleSpec", () => {
    it("rejects manual colors without explicit domain", () => {
        const scale = buildDiscreteScaleSpec(
            makeState({
                dataType: "nominal",
                colorMode: "manual",
                domainMode: "observed",
            })
        );

        expect(scale).toBeNull();
    });
});

describe("normalizeQuantDomainRange", () => {
    it("fills defaults from observed domain", () => {
        const normalized = normalizeQuantDomainRange([], [], [5, 10], null);

        expect(normalized.quantDomain).toEqual([5, 10]);
        expect(normalized.quantRange).toEqual([DEFAULT_COLOR, DEFAULT_COLOR]);
    });
});

describe("normalizeThresholdRange", () => {
    it("pads range to thresholds length + 1", () => {
        const normalized = normalizeThresholdRange([0, 5], ["#000000"]);

        expect(normalized.thresholdRange).toEqual([
            "#000000",
            "#000000",
            "#000000",
        ]);
    });
});

describe("validateScaleState", () => {
    it("rejects discrete manual colors without explicit domain", () => {
        const error = validateScaleState(
            makeState({
                dataType: "nominal",
                colorMode: "manual",
                domainMode: "observed",
            })
        );

        expect(error).toBe("Manual colors require an explicit domain.");
    });

    it("rejects threshold scales without enough colors", () => {
        const error = validateScaleState(
            makeState({
                scaleType: "threshold",
                colorMode: "manual",
                domainMode: "explicit",
                thresholds: [0, 1],
                thresholdRange: ["#000000", "#ffffff"],
            })
        );

        expect(error).toBe(
            "Threshold scales require one more color than thresholds."
        );
    });

    it("rejects unsupported piecewise quantitative scales", () => {
        const error = validateScaleState(
            makeState({
                colorMode: "manual",
                domainMode: "explicit",
                quantDomain: [-2, -1, 0, 1],
                quantRange: ["#000000", "#333333", "#cccccc", "#ffffff"],
                unsupportedPiecewise: true,
            })
        );

        expect(error).toBe(
            "Piecewise quantitative scales support up to three domain stops."
        );
    });
});

describe("parseScaleSpec", () => {
    it("parses manual observed quantitative scale with midpoint", () => {
        const parsed = parseScaleSpec(
            {
                type: "linear",
                domainMid: 0,
                range: ["blue", "lightgray", "red"],
            },
            "quantitative",
            [-5, 5],
            { scheme: "viridis", scaleType: "linear" }
        );

        expect(parsed.colorMode).toBe("manual");
        expect(parsed.domainMode).toBe("observed");
        expect(parsed.domainMid).toBe(0);
        expect(parsed.quantRange).toEqual(["blue", "lightgray", "red"]);
        expect(parsed.quantDomain).toEqual([-5, 5]);
    });

    it("parses explicit discrete scheme domain", () => {
        const parsed = parseScaleSpec(
            {
                type: "ordinal",
                scheme: "tableau10",
                domain: ["A", "B"],
            },
            "nominal",
            [],
            { scheme: "viridis", scaleType: "linear" }
        );

        expect(parsed.colorMode).toBe("scheme");
        expect(parsed.domainMode).toBe("explicit");
        expect(parsed.scheme).toBe("tableau10");
        expect(parsed.domainPairs).toEqual([
            { domain: "A", range: DEFAULT_COLOR },
            { domain: "B", range: DEFAULT_COLOR },
        ]);
    });

    it("parses threshold scale", () => {
        const parsed = parseScaleSpec(
            {
                type: "threshold",
                domain: [0, 10],
                range: ["#0000ff", "#ffffff", "#ff0000"],
            },
            "quantitative",
            [],
            { scheme: "viridis", scaleType: "linear" }
        );

        expect(parsed.scaleType).toBe("threshold");
        expect(parsed.colorMode).toBe("manual");
        expect(parsed.domainMode).toBe("explicit");
        expect(parsed.thresholds).toEqual([0, 10]);
        expect(parsed.thresholdRange).toEqual([
            "#0000ff",
            "#ffffff",
            "#ff0000",
        ]);
    });

    it("normalizes 3-stop piecewise to midpoint", () => {
        const parsed = parseScaleSpec(
            {
                type: "linear",
                domain: [-2.5, 0, 2.5],
                range: ["#0050f8", "#f6f6f6", "#ff3000"],
            },
            "quantitative",
            [],
            { scheme: "viridis", scaleType: "linear" }
        );

        expect(parsed.domainMid).toBe(0);
        expect(parsed.quantDomain).toEqual([-2.5, 2.5]);
        expect(parsed.quantRange).toEqual(["#0050f8", "#f6f6f6", "#ff3000"]);
        expect(parsed.unsupportedPiecewise).toBe(false);
    });

    it("flags unsupported piecewise scales with more than three stops", () => {
        // Non-obvious setup: explicit 4-stop piecewise domain should be rejected.
        const parsed = parseScaleSpec(
            {
                type: "linear",
                domain: [-2, -1, 0, 1],
                range: ["#000000", "#333333", "#cccccc", "#ffffff"],
            },
            "quantitative",
            [],
            { scheme: "viridis", scaleType: "linear" }
        );

        expect(parsed.unsupportedPiecewise).toBe(true);
    });
});
