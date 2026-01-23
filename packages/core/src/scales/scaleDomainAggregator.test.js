import { describe, expect, test, vi } from "vitest";

import ScaleDomainAggregator from "./scaleDomainAggregator.js";
import createDomain, { toRegularArray } from "../utils/domainArray.js";

/**
 * @param {string} field
 * @returns {import("../types/encoder.js").Accessor}
 */
function createAccessor(field) {
    const accessor = /** @type {import("../types/encoder.js").Accessor} */ (
        /** @type {any} */ (
            (/** @type {{ value: number }} */ datum) => datum.value
        )
    );
    accessor.constant = false;
    accessor.scaleChannel = "x";
    accessor.channel = "x";
    accessor.channelDef = { field, type: "quantitative" };
    return accessor;
}

/**
 * @param {import("../types/encoder.js").Accessor[]} accessors
 * @param {object} collector
 * @param {boolean} [contributesToDomain]
 */
function createMember(accessors, collector, contributesToDomain = true) {
    return {
        channel: "x",
        channelDef: { type: "quantitative", scale: {} },
        contributesToDomain,
        view: {
            mark: { encoders: { x: { accessors } } },
            getCollector: () => collector,
        },
    };
}

/**
 * @param {any[]} members
 * @param {import("../spec/channel.js").Type} type
 */
function createAggregator(members, type) {
    return new ScaleDomainAggregator({
        getMembers: () => new Set(members),
        getType: () => type,
        getLocusExtent: () => [0, 10],
        fromComplexInterval: (interval) => /** @type {number[]} */ (interval),
    });
}

describe("ScaleDomainAggregator", () => {
    test("configured domains are unioned", () => {
        const members = [
            {
                channelDef: {
                    type: "quantitative",
                    scale: { domain: [0, 5] },
                },
                contributesToDomain: true,
            },
            {
                channelDef: {
                    type: "quantitative",
                    scale: { domain: [2, 7] },
                },
                contributesToDomain: true,
            },
        ];
        const aggregator = createAggregator(members, "quantitative");
        const domain = aggregator.getConfiguredDomain();
        expect(toRegularArray(domain)).toEqual([0, 7]);
    });

    test("data domains are unioned", () => {
        const domainsByKey = new Map([
            ["quantitative|x|field|a", createDomain("quantitative", [1, 4])],
            ["quantitative|x|field|b", createDomain("quantitative", [0, 6])],
        ]);

        const collector = {
            getDomain: (/** @type {string} */ domainKey) =>
                domainsByKey.get(domainKey),
        };

        const members = [
            createMember([createAccessor("a")], collector),
            createMember([createAccessor("b")], collector),
        ];
        const aggregator = createAggregator(members, "quantitative");
        const domain = aggregator.getDataDomain();
        expect(toRegularArray(domain)).toEqual([0, 6]);
    });

    test("non-contributing members are ignored", () => {
        const domainsByKey = new Map([
            ["quantitative|x|field|a", createDomain("quantitative", [1, 4])],
            ["quantitative|x|field|b", createDomain("quantitative", [0, 6])],
        ]);

        const collector = {
            getDomain: vi.fn((/** @type {string} */ domainKey) =>
                domainsByKey.get(domainKey)
            ),
        };

        const members = [
            createMember([createAccessor("a")], collector, false),
            createMember([createAccessor("b")], collector, true),
        ];

        const aggregator = createAggregator(members, "quantitative");
        const domain = aggregator.getDataDomain();

        expect(toRegularArray(domain)).toEqual([0, 6]);
        expect(collector.getDomain).toHaveBeenCalledTimes(1);
    });

    test("locus defaults to genome extent when no domain is configured", () => {
        const aggregator = createAggregator([], "locus");
        expect(aggregator.getConfiguredOrDefaultDomain()).toEqual([0, 10]);
    });

    test("configured domains use complex conversion", () => {
        const fromComplexInterval = vi.fn(
            (interval) => /** @type {number[]} */ (interval)
        );
        const aggregator = new ScaleDomainAggregator({
            getMembers: () =>
                new Set(
                    /** @type {any} */ ([
                        {
                            channelDef: {
                                type: "quantitative",
                                scale: { domain: [0, 5] },
                            },
                            contributesToDomain: true,
                        },
                    ])
                ),
            getType: () => "quantitative",
            getLocusExtent: () => [0, 10],
            fromComplexInterval,
        });

        aggregator.getConfiguredDomain();
        expect(fromComplexInterval).toHaveBeenCalledWith([0, 5]);
    });

    test("configured domains are cached between calls", () => {
        const fromComplexInterval = vi.fn(
            (interval) => /** @type {number[]} */ (interval)
        );
        const aggregator = new ScaleDomainAggregator({
            getMembers: () =>
                new Set(
                    /** @type {any} */ ([
                        {
                            channelDef: {
                                type: "quantitative",
                                scale: { domain: [0, 5] },
                            },
                            contributesToDomain: true,
                        },
                    ])
                ),
            getType: () => "quantitative",
            getLocusExtent: () => [0, 10],
            fromComplexInterval,
        });

        aggregator.getConfiguredDomain();
        aggregator.getConfiguredDomain();

        expect(fromComplexInterval).toHaveBeenCalledTimes(1);
    });

    test("configured domain cache can be invalidated", () => {
        const fromComplexInterval = vi.fn(
            (interval) => /** @type {number[]} */ (interval)
        );

        /** @type {Set<any>} */
        const members = new Set([
            {
                channelDef: {
                    type: "quantitative",
                    scale: { domain: [0, 5] },
                },
                contributesToDomain: true,
            },
        ]);

        const aggregator = new ScaleDomainAggregator({
            getMembers: () => members,
            getType: () => "quantitative",
            getLocusExtent: () => [0, 10],
            fromComplexInterval,
        });

        expect(toRegularArray(aggregator.getConfiguredDomain())).toEqual([
            0, 5,
        ]);

        members.add({
            channelDef: {
                type: "quantitative",
                scale: { domain: [2, 7] },
            },
            contributesToDomain: true,
        });

        aggregator.invalidateConfiguredDomain();

        expect(toRegularArray(aggregator.getConfiguredDomain())).toEqual([
            0, 7,
        ]);
        expect(fromComplexInterval).toHaveBeenCalledTimes(3);
    });

    test("default domain is empty when no data is requested", () => {
        const aggregator = createAggregator([], "quantitative");
        expect(aggregator.getConfiguredOrDefaultDomain()).toEqual([]);
    });

    test("captures initial domain for continuous scales", () => {
        const aggregator = createAggregator([], "quantitative");
        const scale = /** @type {any} */ ({
            type: "linear",
            domain: () => [2, 8],
        });
        const notify = aggregator.captureInitialDomain(scale, false);
        expect(notify).toBe(true);
        expect(aggregator.initialDomainSnapshot).toEqual([2, 8]);
    });
});
