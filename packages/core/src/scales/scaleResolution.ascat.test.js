import fs from "node:fs";

import { describe, expect, test, vi } from "vitest";

import Collector from "../data/collector.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import View from "../view/view.js";
import * as resolutionMemberOrder from "./resolutionMemberOrder.js";
import ScaleResolution from "./scaleResolution.js";

describe("Interactive updates keep scale-resolution work bounded", () => {
    test("initialization still exercises the real ASCAT scale-resolution path", async () => {
        const spec = createTrimmedAscatSpec();

        // ASCAT is a good fixture here because it combines shared locus scales,
        // selection-linked parameters, and data-driven domains in one spec.
        // These are sanity probes for the setup itself. If the example stops
        // constructing shared scales, this test should fail before the update
        // regression below becomes ambiguous.
        const pathSpy = vi.spyOn(View.prototype, "getPathString");
        const orderSpy = vi.spyOn(
            resolutionMemberOrder,
            "orderResolutionMembers"
        );
        const getDomainSpy = vi.spyOn(Collector.prototype, "getDomain");

        try {
            await createHeadlessEngine(spec);

            expect(pathSpy).toHaveBeenCalled();
            expect(orderSpy).toHaveBeenCalled();
            expect(getDomainSpy).toHaveBeenCalled();
        } finally {
            pathSpy.mockRestore();
            orderSpy.mockRestore();
            getDomainSpy.mockRestore();
        }
    });

    test("rho/psi changes do not re-run path-based member ordering", async () => {
        const spec = createTrimmedAscatSpec();

        const pathSpy = vi.spyOn(View.prototype, "getPathString");
        const orderSpy = vi.spyOn(
            resolutionMemberOrder,
            "orderResolutionMembers"
        );
        const reconfigureSpy = vi.spyOn(
            ScaleResolution.prototype,
            "reconfigureDomain"
        );

        try {
            const { view } = await createHeadlessEngine(spec);
            const target = view
                .getDescendants()
                .find((descendant) =>
                    descendant.paramRuntime.hasLocalParam("rho")
                );

            if (!target) {
                throw new Error("Expected the ASCAT parameter view to exist.");
            }

            // Ignore the setup cost. This regression is about interactive updates.
            pathSpy.mockClear();
            orderSpy.mockClear();
            reconfigureSpy.mockClear();

            target.paramRuntime.setValue("rho", 0.57);
            target.paramRuntime.setValue("psi", 2.8);

            await Promise.resolve();

            expect(reconfigureSpy).toHaveBeenCalled();
            expect(orderSpy).not.toHaveBeenCalled();
            expect(pathSpy).not.toHaveBeenCalled();
        } finally {
            pathSpy.mockRestore();
            orderSpy.mockRestore();
            reconfigureSpy.mockRestore();
        }
    });

    test("named dataset refresh recomputes data domains without re-running path sorting", async () => {
        const spec = createTrimmedAscatSpec();

        const pathSpy = vi.spyOn(View.prototype, "getPathString");
        const orderSpy = vi.spyOn(
            resolutionMemberOrder,
            "orderResolutionMembers"
        );
        const getDomainSpy = vi.spyOn(Collector.prototype, "getDomain");
        const reconfigureSpy = vi.spyOn(
            ScaleResolution.prototype,
            "reconfigureDomain"
        );

        try {
            const { context } = await createHeadlessEngine(spec);
            const dataSource =
                context.dataFlow.findNamedDataSource("segments_S96");

            if (!dataSource) {
                throw new Error("Expected the named ASCAT dataset to exist.");
            }

            // Ignore initialization. We want to observe the incremental refresh.
            pathSpy.mockClear();
            orderSpy.mockClear();
            getDomainSpy.mockClear();
            reconfigureSpy.mockClear();

            dataSource.dataSource.updateDynamicData(SEGMENTS_S96.slice(0, 5));

            expect(reconfigureSpy).toHaveBeenCalled();
            expect(getDomainSpy).toHaveBeenCalled();
            expect(orderSpy).not.toHaveBeenCalled();
            expect(pathSpy).not.toHaveBeenCalled();
        } finally {
            pathSpy.mockRestore();
            orderSpy.mockRestore();
            getDomainSpy.mockRestore();
            reconfigureSpy.mockRestore();
        }
    });
});

const SEGMENTS_S96 = [
    {
        sample: "S96",
        chr: 1,
        startpos: 1695590,
        endpos: 116624361,
        nMajor: 2,
        nMinor: 0,
        logRMean: -0.13251494505494504,
        bafMean: 0.21788536017543858,
        nProbes: 455,
    },
    {
        sample: "S96",
        chr: 1,
        startpos: 116976886,
        endpos: 120138178,
        nMajor: 2,
        nMinor: 2,
        logRMean: 0.1798375,
        bafMean: 0.5,
        nProbes: 16,
    },
    {
        sample: "S96",
        chr: 1,
        startpos: 143133910,
        endpos: 147896005,
        nMajor: 4,
        nMinor: 1,
        logRMean: 0.3729,
        bafMean: 0.3011666666666667,
        nProbes: 12,
    },
    {
        sample: "S96",
        chr: 1,
        startpos: 147970991,
        endpos: 244820741,
        nMajor: 3,
        nMinor: 1,
        logRMean: 0.21901432098765433,
        bafMean: 0.32507599766949147,
        nProbes: 405,
    },
    {
        sample: "S96",
        chr: 2,
        startpos: 385195,
        endpos: 3254139,
        nMajor: 2,
        nMinor: 0,
        logRMean: -0.10943636363636364,
        bafMean: 0.2435465375,
        nProbes: 11,
    },
    {
        sample: "S96",
        chr: 2,
        startpos: 3387576,
        endpos: 97159495,
        nMajor: 2,
        nMinor: 1,
        logRMean: 0.04850168918918919,
        bafMean: 0.3864391251373626,
        nProbes: 296,
    },
    {
        sample: "S96",
        chr: 2,
        startpos: 97823557,
        endpos: 179108526,
        nMajor: 1,
        nMinor: 1,
        logRMean: -0.15197698412698413,
        bafMean: 0.5,
        nProbes: 252,
    },
    {
        sample: "S96",
        chr: 2,
        startpos: 179358035,
        endpos: 181991071,
        nMajor: 2,
        nMinor: 1,
        logRMean: 0.12527272727272726,
        bafMean: 0.42221864583333335,
        nProbes: 11,
    },
    {
        sample: "S96",
        chr: 2,
        startpos: 182245884,
        endpos: 186200765,
        nMajor: 1,
        nMinor: 1,
        logRMean: -0.13618,
        bafMean: 0.5,
        nProbes: 10,
    },
];

const RAW_S96 = [
    { SNP: "SNP1", chr: 1, pos: 1695590, logR: -0.0589, baf: 0.2464 },
    { SNP: "SNP2", chr: 1, pos: 2189662, logR: 0.0293, baf: 0.2013 },
    { SNP: "SNP3", chr: 1, pos: 2393282, logR: -0.2291, baf: null },
    { SNP: "SNP4", chr: 1, pos: 2414781, logR: -0.2221, baf: 0.7504 },
    { SNP: "SNP5", chr: 1, pos: 2516275, logR: -0.0379, baf: null },
    { SNP: "SNP6", chr: 1, pos: 2994744, logR: -0.2117, baf: null },
    { SNP: "SNP7", chr: 1, pos: 3151364, logR: -0.1369, baf: null },
    { SNP: "SNP8", chr: 1, pos: 3627001, logR: -0.1862, baf: 0.8155 },
    { SNP: "SNP9", chr: 1, pos: 3847971, logR: -0.1045, baf: 0.2257 },
];

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isRecord(value) {
    return typeof value === "object" && value !== null;
}

/**
 * Rewrites the ASCAT example to use named inline datasets instead of remote TSVs.
 *
 * The test keeps the original view hierarchy and parameter wiring, but swaps in
 * tiny in-memory datasets so the regression stays fast and deterministic.
 *
 * @param {Record<string, any>} node
 */
function rewriteDatasetUrls(node) {
    if (!isRecord(node)) {
        return;
    }

    if (isRecord(node.data) && typeof node.data.url === "string") {
        if (node.data.url.endsWith("segments_S96.tsv")) {
            node.data = { name: "segments_S96" };
        } else if (node.data.url.endsWith("raw_S96.tsv")) {
            node.data = { name: "raw_S96" };
        }
    }

    for (const value of Object.values(node)) {
        rewriteDatasetUrls(value);
    }
}

/**
 * Builds a trimmed ASCAT spec that still exercises the full interaction path.
 *
 * The first 10 lines from the two TSVs are enough to create real collectors and
 * shared scale resolutions, while avoiding the cost of loading the full sample.
 *
 * @returns {import("../spec/root.js").RootSpec}
 */
function createTrimmedAscatSpec() {
    /** @type {import("../spec/root.js").RootSpec} */
    const spec = JSON.parse(
        fs.readFileSync(
            new URL(
                "../../../../examples/docs/genomic-data/examples/ASCAT-algorithm.json",
                import.meta.url
            ),
            "utf8"
        )
    );

    spec.data = { name: "segments_S96" };
    spec.datasets = {
        segments_S96: SEGMENTS_S96,
        raw_S96: RAW_S96,
    };
    rewriteDatasetUrls(spec);

    return spec;
}
