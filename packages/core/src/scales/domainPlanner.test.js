import { describe, expect, test, vi } from "vitest";

import {
    getScaleMemberAccessors,
    resolveConfiguredDomain,
    resolveDataDomain,
    resolveDefaultDomain,
    resolveSelectionDomainInfo,
} from "./domainPlanner.js";
import createDomain, { toRegularArray } from "../utils/domainArray.js";
import { validateSharedViewportDomain } from "./viewportDomain.js";

/** @typedef {import("./scaleResolution.js").ScaleResolutionMember} Member */

/**
 * @param {string} expr
 * @returns {never}
 */
function rejectUnexpectedExpression(expr) {
    throw new Error(`Unexpected expression: ${expr}`);
}

/**
 * @param {string} paramName
 * @returns {never}
 */
function rejectUnexpectedSelection(paramName) {
    throw new Error(`Unexpected selection: ${paramName}`);
}

/** @type {import("./domainPlanner.js").FromComplexInterval} */
const numericInterval = (interval) => /** @type {number[]} */ (interval);

/**
 * Only domain declarations are needed by the pure configured-domain functions.
 * @param {import("../spec/scale.js").Scale["domain"]} domain
 * @param {import("../spec/channel.js").Type} [type]
 * @param {import("../spec/channel.js").ChannelWithScale} [channel]
 * @returns {Member}
 */
function configuredMember(domain, type = "quantitative", channel = "x") {
    return /** @type {Member} */ ({
        channel,
        channelDef: { type, scale: { domain } },
        contributesToDomain: true,
    });
}

/**
 * @param {string} field
 * @returns {import("../types/encoder.js").ScaleAccessor}
 */
function createAccessor(field) {
    return /** @type {import("../types/encoder.js").ScaleAccessor} */ (
        /** @type {unknown} */ (
            Object.assign(
                (/** @type {Record<string, number>} */ datum) => datum[field],
                {
                    constant: false,
                    scaleChannel: "x",
                    channel: "x",
                    channelDef: { field, type: "quantitative" },
                }
            )
        )
    );
}

/**
 * @param {import("../types/encoder.js").ScaleAccessor[]} accessors
 * @param {object} collector
 * @param {boolean} [contributesToDomain]
 * @returns {Member}
 */
function dataMember(accessors, collector, contributesToDomain = true) {
    return /** @type {Member} */ (
        /** @type {unknown} */ ({
            channel: "x",
            channelDef: { type: "quantitative", scale: {} },
            contributesToDomain,
            view: {
                mark: {
                    encoders: {
                        x: {
                            branches: accessors.map((accessor) => ({
                                accessor,
                                predicate: () => true,
                            })),
                        },
                    },
                },
                getCollector: () => collector,
            },
        })
    );
}

describe("configured domain resolution", () => {
    test("member and view-level configured domains are unioned", () => {
        const excluded = configuredMember([-100, 100]);
        excluded.contributesToDomain = false;
        const { domain } = resolveConfiguredDomain(
            new Set([
                configuredMember([0, 5]),
                configuredMember([2, 7]),
                excluded,
            ]),
            { channel: "x", type: "quantitative", domain: [-2, 3] },
            rejectUnexpectedExpression,
            rejectUnexpectedSelection,
            numericInterval,
            true
        );
        expect(toRegularArray(domain)).toEqual([-2, 7]);
    });

    test("configured locus domains convert explicit endpoints to half-open intervals", () => {
        const interval = [
            { chrom: "chr1", pos: 0 },
            { chrom: "chr1", pos: 9 },
        ];
        const convert = vi.fn(() => [10, 20]);
        const { domain } = resolveConfiguredDomain(
            new Set([configuredMember(interval, "locus")]),
            undefined,
            rejectUnexpectedExpression,
            rejectUnexpectedSelection,
            convert,
            true
        );
        expect(toRegularArray(domain)).toEqual([10, 21]);
        expect(convert).toHaveBeenCalledWith(interval);
    });

    test("selection intervals already use internal index coordinates", () => {
        const runtime = {};
        const { domain, selectionRef } = resolveConfiguredDomain(
            new Set([configuredMember({ param: "brush" }, "index")]),
            undefined,
            rejectUnexpectedExpression,
            () => ({
                runtime,
                selection: { type: "interval", intervals: { x: [2, 5] } },
            }),
            numericInterval,
            true
        );
        expect(toRegularArray(domain)).toEqual([2, 5]);
        expect(selectionRef).toMatchObject({
            runtime,
            param: "brush",
            encoding: "x",
        });
    });

    test.each([undefined, { type: "interval", intervals: { x: null } }])(
        "an empty or missing selection retains its link without proposing a domain",
        (selection) => {
            const { domain, selectionRef } = resolveConfiguredDomain(
                new Set([configuredMember({ param: "brush" })]),
                undefined,
                rejectUnexpectedExpression,
                () => ({
                    runtime: {},
                    selection:
                        /** @type {import("../types/selectionTypes.js").IntervalSelection} */ (
                            selection
                        ),
                }),
                numericInterval,
                true
            );
            expect(domain).toBeUndefined();
            expect(selectionRef).toMatchObject({
                param: "brush",
                encoding: "x",
            });
        }
    );

    test.each([true, false])(
        "selection initial can be bypassed: include=%s",
        (includeInitial) => {
            const { domain } = resolveConfiguredDomain(
                new Set([
                    configuredMember({ param: "brush", initial: [3, 7] }),
                ]),
                undefined,
                rejectUnexpectedExpression,
                () => ({
                    runtime: {},
                    selection: { type: "interval", intervals: { x: null } },
                }),
                numericInterval,
                includeInitial
            );
            expect(domain && toRegularArray(domain)).toEqual(
                includeInitial ? [3, 7] : undefined
            );
        }
    );

    test("conflicting selection references are rejected", () => {
        const runtime = {};
        expect(() =>
            resolveConfiguredDomain(
                new Set([
                    configuredMember({ param: "brushA" }),
                    configuredMember({ param: "brushB" }),
                ]),
                undefined,
                rejectUnexpectedExpression,
                () => ({
                    runtime,
                    selection: { type: "interval", intervals: { x: [2, 5] } },
                }),
                numericInterval,
                true
            )
        ).toThrow("Conflicting selection domain references");
    });

    test("non-positional selections require an explicit encoding", () => {
        expect(() =>
            resolveConfiguredDomain(
                new Set([
                    configuredMember(
                        { param: "brush" },
                        "quantitative",
                        "color"
                    ),
                ]),
                undefined,
                rejectUnexpectedExpression,
                rejectUnexpectedSelection,
                numericInterval,
                true
            )
        ).toThrow('requires an explicit "encoding"');
    });
});

describe("viewport domain declarations", () => {
    test.each([1, 2])(
        "%s viewport references select data extraction without a configured interval",
        (count) => {
            const members = new Set([
                ...Array.from({ length: count }, () =>
                    configuredMember({ source: "viewport" })
                ),
                configuredMember(undefined),
            ]);
            expect(validateSharedViewportDomain(members, undefined)).toBe(true);
            expect(
                resolveConfiguredDomain(
                    members,
                    undefined,
                    rejectUnexpectedExpression,
                    rejectUnexpectedSelection,
                    numericInterval,
                    true
                ).domain
            ).toBeUndefined();
        }
    );

    test("viewport and other configured domains cannot be mixed", () => {
        expect(() =>
            validateSharedViewportDomain(
                new Set([
                    configuredMember({ source: "viewport" }),
                    configuredMember([0, 10]),
                ]),
                undefined
            )
        ).toThrow("Cannot mix viewport-derived and other configured domains");
    });

    test("viewport domains require a continuous data type", () => {
        expect(() =>
            validateSharedViewportDomain(
                new Set([
                    configuredMember(
                        { source: "viewport" },
                        "nominal",
                        "color"
                    ),
                ]),
                undefined
            )
        ).toThrow('channel "color" has type "nominal"');
    });

    test("view-level viewport declarations select the resolution-wide mode", () => {
        /** @type {import("./domainPlanner.js").ConfiguredDomainSource} */
        const source = {
            channel: "y",
            type: "quantitative",
            domain: { source: "viewport" },
        };
        expect(validateSharedViewportDomain(new Set(), source)).toBe(true);
        expect(
            resolveConfiguredDomain(
                new Set(),
                source,
                rejectUnexpectedExpression,
                rejectUnexpectedSelection,
                numericInterval,
                true
            ).domain
        ).toBeUndefined();
    });
});

describe("raw data and default domains", () => {
    test("data domains union distinct accessors and de-duplicate shared collector queries", () => {
        const domains = new Map([
            ["quantitative|x|field|a", createDomain("quantitative", [1, 4])],
            ["quantitative|x|field|b", createDomain("quantitative", [0, 6])],
        ]);
        const collector = {
            getDomain: vi.fn((/** @type {string} */ key) => domains.get(key)),
        };
        const members = new Set([
            dataMember([createAccessor("a")], collector),
            dataMember([createAccessor("a"), createAccessor("b")], collector),
            dataMember([createAccessor("excluded")], collector, false),
        ]);
        const domain = resolveDataDomain(
            members,
            () => "quantitative",
            getScaleMemberAccessors
        );
        expect(toRegularArray(domain)).toEqual([0, 6]);
        expect(collector.getDomain).toHaveBeenCalledTimes(2);
    });

    test("missing contributors do not propose a data domain", () => {
        expect(
            resolveDataDomain(
                new Set(),
                () => "quantitative",
                getScaleMemberAccessors
            )
        ).toBeUndefined();
    });

    test("locus defaults use the requested assembly extent rather than loaded data", () => {
        const extent = vi.fn(() => [0, 100]);
        expect(
            resolveDefaultDomain(
                "locus",
                extent,
                createDomain("locus", [10, 20]),
                "hg38"
            )
        ).toEqual([0, 100]);
        expect(extent).toHaveBeenCalledWith("hg38");
    });

    test("index data defaults convert raw inclusive coordinates once", () => {
        const data = createDomain("index", [2, 5]);
        expect(
            resolveDefaultDomain("index", () => [], data, undefined)
        ).toEqual([2, 6]);
        expect(toRegularArray(data)).toEqual([2, 5]);
    });

    test("empty index data proposes an empty default rather than invalid endpoints", () => {
        expect(
            resolveDefaultDomain(
                "index",
                () => [],
                createDomain("index"),
                undefined
            )
        ).toEqual([]);
    });

    test("quantitative defaults preserve raw data and are empty without it", () => {
        const data = createDomain("quantitative", [2, 5]);
        expect(
            toRegularArray(
                resolveDefaultDomain("quantitative", () => [], data, undefined)
            )
        ).toEqual([2, 5]);
        expect(
            resolveDefaultDomain("quantitative", () => [], undefined, undefined)
        ).toEqual([]);
    });
});

describe("selection domain metadata", () => {
    test("ordinary expressions and complex locus domains require no evaluation", () => {
        expect(
            resolveSelectionDomainInfo(
                new Set([
                    configuredMember({ expr: "notInitialized" }),
                    configuredMember(
                        [{ chrom: "chr1" }, { chrom: "chr2" }],
                        "locus"
                    ),
                ]),
                undefined,
                rejectUnexpectedSelection
            )
        ).toBeUndefined();
    });

    test("repeated references retain scope identity and combine initial metadata", () => {
        const runtime = {};
        expect(
            resolveSelectionDomainInfo(
                new Set([
                    configuredMember({ param: "brush" }),
                    configuredMember({ param: "brush", initial: [2, 4] }),
                ]),
                undefined,
                () => ({ runtime, selection: undefined })
            )
        ).toEqual({
            runtime,
            param: "brush",
            encoding: "x",
            hasInitial: true,
        });
    });

    test("a view-level selection with explicit encoding resolves on a non-positional channel", () => {
        const runtime = {};
        const resolve = vi.fn(() => ({ runtime, selection: undefined }));
        expect(
            resolveSelectionDomainInfo(
                new Set(),
                {
                    channel: "color",
                    type: "quantitative",
                    domain: { param: "brush", encoding: "y" },
                },
                resolve
            )
        ).toMatchObject({ param: "brush", encoding: "y" });
        expect(resolve).toHaveBeenCalledWith("brush", "y");
    });

    test("equal parameter names in different scopes conflict", () => {
        expect(() =>
            resolveSelectionDomainInfo(
                new Set([
                    configuredMember({ param: "brush" }),
                    configuredMember({ param: "brush" }),
                ]),
                undefined,
                () => ({ runtime: {}, selection: undefined })
            )
        ).toThrow("Conflicting selection domain references");
    });

    test("literal and selection declarations conflict before domains are evaluated", () => {
        expect(() =>
            resolveSelectionDomainInfo(
                new Set([
                    configuredMember({ param: "brush" }),
                    configuredMember({ expr: "notInitialized" }),
                ]),
                undefined,
                () => ({ runtime: {}, selection: undefined })
            )
        ).toThrow("Cannot mix selection-driven and literal configured domains");
    });
});
