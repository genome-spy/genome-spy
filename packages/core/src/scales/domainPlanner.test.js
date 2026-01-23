import { describe, expect, test, vi } from "vitest";

import DomainPlanner from "./domainPlanner.js";
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
function createPlanner(members, type) {
    return new DomainPlanner({
        getMembers: () => new Set(members),
        getType: () => type,
        getLocusExtent: () => [0, 10],
        fromComplexInterval: (interval) => /** @type {number[]} */ (interval),
    });
}

describe("DomainPlanner", () => {
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
        const planner = createPlanner(members, "quantitative");
        const domain = planner.getConfiguredDomain();
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
        const planner = createPlanner(members, "quantitative");
        const domain = planner.getDataDomain();
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

        const planner = createPlanner(members, "quantitative");
        const domain = planner.getDataDomain();

        expect(toRegularArray(domain)).toEqual([0, 6]);
        expect(collector.getDomain).toHaveBeenCalledTimes(1);
    });

    test("locus defaults to genome extent when no domain is configured", () => {
        const planner = createPlanner([], "locus");
        expect(planner.getConfiguredOrDefaultDomain()).toEqual([0, 10]);
    });

    test("configured domains use complex conversion", () => {
        const fromComplexInterval = vi.fn(
            (interval) => /** @type {number[]} */ (interval)
        );
        const planner = new DomainPlanner({
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

        planner.getConfiguredDomain();
        expect(fromComplexInterval).toHaveBeenCalledWith([0, 5]);
    });

    test("configured domains are cached between calls", () => {
        const fromComplexInterval = vi.fn(
            (interval) => /** @type {number[]} */ (interval)
        );
        const planner = new DomainPlanner({
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

        planner.getConfiguredDomain();
        planner.getConfiguredDomain();

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

        const planner = new DomainPlanner({
            getMembers: () => members,
            getType: () => "quantitative",
            getLocusExtent: () => [0, 10],
            fromComplexInterval,
        });

        expect(toRegularArray(planner.getConfiguredDomain())).toEqual([0, 5]);

        members.add({
            channelDef: {
                type: "quantitative",
                scale: { domain: [2, 7] },
            },
            contributesToDomain: true,
        });

        planner.invalidateConfiguredDomain();

        expect(toRegularArray(planner.getConfiguredDomain())).toEqual([0, 7]);
        expect(fromComplexInterval).toHaveBeenCalledTimes(3);
    });

    test("default domain is empty when no data is requested", () => {
        const planner = createPlanner([], "quantitative");
        expect(planner.getConfiguredOrDefaultDomain()).toEqual([]);
    });

    test("captures initial domain for continuous scales", () => {
        const planner = createPlanner([], "quantitative");
        const scale = /** @type {any} */ ({
            type: "linear",
            domain: () => [2, 8],
        });
        const notify = planner.captureInitialDomain(scale, false);
        expect(notify).toBe(true);
        expect(planner.initialDomainSnapshot).toEqual([2, 8]);
    });
});
