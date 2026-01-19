import { describe, expect, test, vi } from "vitest";

import ScaleDomainAggregator from "./scaleDomainAggregator.js";
import createDomain, { toRegularArray } from "../utils/domainArray.js";

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
            },
            {
                channelDef: {
                    type: "quantitative",
                    scale: { domain: [2, 7] },
                },
            },
        ];
        const aggregator = createAggregator(members, "quantitative");
        const domain = aggregator.getConfiguredDomain();
        expect(toRegularArray(domain)).toEqual([0, 7]);
    });

    test("data domains are unioned", () => {
        const members = [
            {
                channel: "x",
                dataDomainSource: () => createDomain("quantitative", [1, 4]),
            },
            {
                channel: "x",
                dataDomainSource: () => createDomain("quantitative", [0, 6]),
            },
        ];
        const aggregator = createAggregator(members, "quantitative");
        const domain = aggregator.getDataDomain();
        expect(toRegularArray(domain)).toEqual([0, 6]);
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
