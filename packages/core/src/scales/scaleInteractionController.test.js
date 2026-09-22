import { describe, expect, test, vi } from "vitest";

import Genome from "../genome/genome.js";
// Register Core's locus scale before exercising its public navigation semantics.
import "./scaleResolution.js";
import ScaleInteractionController from "./scaleInteractionController.js";

/**
 * @param {number[]} domain
 * @param {Record<string, any>} [props]
 */
function createLinearScale(domain, props = {}) {
    let current = domain.slice();
    const type = props.type ?? "linear";
    return /** @type {any} */ ({
        type,
        props: { zoom: true, reverse: false, ...props, type },
        domain: (/** @type {number[] | undefined} */ next) => {
            if (next) {
                current = next;
            }
            return current;
        },
        invert: (/** @type {number} */ x) => x,
    });
}

/**
 * @param {object} [options]
 * @param {ReturnType<typeof createLinearScale>} [options.scale]
 * @param {(domain: number[], duration: number, renderImmediately?: boolean) => Promise<void>} [options.navigate]
 * @param {() => void} [options.renderImmediately]
 * @param {() => number[]} [options.getGenomeExtent]
 * @param {() => number[] | undefined} [options.getDataZoomExtent]
 * @param {(domain: any) => number[]} [options.fromComplexInterval]
 */
function createController({
    scale,
    navigate,
    renderImmediately,
    getGenomeExtent,
    getDataZoomExtent,
    fromComplexInterval,
} = {}) {
    scale ??= createLinearScale([0, 10]);
    return new ScaleInteractionController({
        getScale: () => scale,
        navigate:
            navigate ??
            (async (domain) => {
                scale.domain(domain);
            }),
        getInitialDomainSnapshot: () => [0, 10],
        getDataZoomExtent: getDataZoomExtent ?? (() => [0, 10]),
        getResetDomain: () => [0, 10],
        fromComplexInterval:
            fromComplexInterval ?? ((/** @type {any} */ interval) => interval),
        getGenomeExtent: getGenomeExtent ?? (() => [0, 10]),
        renderImmediately: renderImmediately ?? (() => undefined),
    });
}

describe("ScaleInteractionController", () => {
    test("zoom submits a transformed domain", () => {
        const scale = createLinearScale([0, 10]);
        const controller = createController({ scale });

        const changed = controller.zoom(0.5, 5, 0);
        expect(changed).toBe(true);
        expect(scale.domain()).toEqual([2.5, 7.5]);
    });

    test("resetZoom restores the reset domain", () => {
        const scale = createLinearScale([2, 8]);
        const controller = createController({ scale });

        const changed = controller.resetZoom();
        expect(changed).toBe(true);
        expect(scale.domain()).toEqual([0, 10]);
    });

    test("zoom extent uses explicit extent for locus scales", () => {
        const scale = createLinearScale([0, 10], {
            type: "locus",
            zoom: { extent: [1, 4] },
        });
        const controller = createController({ scale });

        expect(controller.getZoomExtent()).toEqual([1, 5]);
    });

    test("zoom extent falls back to genome extent for locus scales", () => {
        const scale = createLinearScale([0, 10], {
            type: "locus",
            zoom: true,
        });
        const controller = createController({
            scale,
            getGenomeExtent: () => [0, 12],
        });

        expect(controller.getZoomExtent()).toEqual([0, 12]);
    });

    test("zoom extent can be derived from data", () => {
        const scale = createLinearScale([2, 8], {
            zoom: { extent: "data" },
        });
        const controller = createController({
            scale,
            getDataZoomExtent: () => [-5, 15],
        });

        expect(controller.getZoomExtent()).toEqual([-5, 15]);
    });

    test("unbounded zoom extent does not clamp zooming", () => {
        const scale = createLinearScale([0, 10], {
            zoom: { extent: "unbounded" },
        });
        const controller = createController({ scale });

        expect(controller.zoom(2, 5, 0)).toBe(true);
        expect(scale.domain()).toEqual([-5, 15]);
    });

    test("unbounded zoom extent rejects locus scales", () => {
        const scale = createLinearScale([0, 10], {
            type: "locus",
            zoom: { extent: "unbounded" },
        });
        const controller = createController({ scale });

        expect(() => controller.getZoomExtent()).toThrow(
            'Zoom extent "unbounded" is not supported for locus scales.'
        );
    });

    test("unbounded zoom level uses the initial domain as reference", () => {
        const scale = createLinearScale([-5, 15], {
            zoom: { extent: "unbounded" },
        });
        const controller = createController({ scale });

        expect(controller.getZoomLevel()).toBe(0.5);
    });

    test("isZoomed is true only when current domain differs from reset domain", () => {
        const scale = createLinearScale([0, 10]);
        const controller = createController({ scale });

        expect(controller.isZoomed()).toBe(false);
        scale.domain([2, 8]);
        expect(controller.isZoomed()).toBe(true);
    });

    test("zoomTo accepts options object with duration", async () => {
        const scale = createLinearScale([0, 10]);
        const navigate = vi.fn(async (domain) => {
            scale.domain(domain);
        });
        const controller = createController({ scale, navigate });

        await controller.zoomTo([2, 8], { duration: 0 });

        expect(scale.domain()).toEqual([2, 8]);
        expect(navigate).toHaveBeenCalledWith([2, 8], 0, false);
    });

    test("zoomTo still accepts direct duration for compatibility", async () => {
        const scale = createLinearScale([0, 10]);
        const navigate = vi.fn(async (domain) => {
            scale.domain(domain);
        });
        const controller = createController({ scale, navigate });

        await controller.zoomTo([2, 8], 500);

        expect(navigate).toHaveBeenCalledWith([2, 8], 500, false);
    });

    test("zoomTo can render immediately without requesting animation frame", async () => {
        const scale = createLinearScale([0, 10]);
        const navigate = vi.fn(async (domain) => {
            scale.domain(domain);
        });
        const renderImmediately = vi.fn();
        const controller = createController({
            scale,
            navigate,
            renderImmediately,
        });

        await controller.zoomTo([2, 8], {
            duration: 0,
            renderImmediately: true,
        });

        expect(scale.domain()).toEqual([2, 8]);
        expect(renderImmediately).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith([2, 8], 0, true);
    });

    test("zoomTo rejects immediate rendering for animated zooms", async () => {
        const controller = createController({
            scale: createLinearScale([0, 10]),
            renderImmediately: vi.fn(),
        });

        await expect(
            controller.zoomTo([2, 8], {
                duration: 500,
                renderImmediately: true,
            })
        ).rejects.toThrow(
            "renderImmediately is not supported for animated zooms."
        );
    });
});

describe("genomic navigation bounds", () => {
    const genome = new Genome({
        name: "test-genome",
        contigs: [
            { name: "chr1", size: 100 },
            { name: "chr2", size: 80 },
        ],
    });

    function setupGenomic() {
        const scale = createLinearScale([0, 180], { type: "locus" });
        const navigate = vi.fn(async (domain) => {
            scale.domain(domain);
        });
        return {
            scale,
            navigate,
            controller: createController({
                scale,
                navigate,
                fromComplexInterval: (domain) =>
                    genome.toContinuousInterval(domain),
            }),
        };
    }

    test.each([
        [
            { chrom: "chr1", pos: 100 },
            { chrom: "chr1", pos: 110 },
        ],
        [
            { chrom: "chr1", pos: 90 },
            { chrom: "chr1", pos: 100 },
        ],
        [
            { chrom: "chr2", pos: 10 },
            { chrom: "chr1", pos: 90 },
        ],
        [
            { chrom: "chr1", pos: -1 },
            { chrom: "chr2", pos: 1 },
        ],
        [
            { chrom: "chr1", pos: 0 },
            { chrom: "chr2", pos: -2 },
        ],
    ])(
        "rejects invalid endpoints before changing the chart: %j",
        async (start, end) => {
            const { controller, navigate, scale } = setupGenomic();
            await expect(
                controller.zoomTo([start, end], { duration: 0 })
            ).rejects.toThrow(/chromosome|increasing/);
            expect(navigate).not.toHaveBeenCalled();
            expect(scale.domain()).toEqual([0, 180]);
        }
    );

    test("preserves whole chromosomes, inclusive endpoints and a next-chromosome zero boundary", async () => {
        const { controller, scale } = setupGenomic();
        await controller.zoomTo([{ chrom: "chr2" }], { duration: 0 });
        expect(scale.domain()).toEqual([100, 180]);
        await controller.zoomTo(
            [
                { chrom: "chr1", pos: 90 },
                { chrom: "chr2", pos: -1 },
            ],
            { duration: 0 }
        );
        expect(scale.domain()).toEqual([90, 100]);
        await controller.zoomTo(
            [
                { chrom: "chr1", pos: 99 },
                { chrom: "chr2", pos: 0 },
            ],
            { duration: 0 }
        );
        expect(scale.domain()).toEqual([99, 101]);
    });
});
