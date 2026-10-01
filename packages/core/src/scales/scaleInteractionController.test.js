import { describe, expect, test, vi } from "vitest";

import ScaleInteractionController from "./scaleInteractionController.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";

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
 */
function createController({
    scale,
    navigate,
    renderImmediately,
    getGenomeExtent,
    getDataZoomExtent,
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
        fromComplexInterval: /** @returns {number[]} */ (
            /** @type {any} */ interval
        ) => interval,
        getGenomeExtent: getGenomeExtent ?? (() => [0, 10]),
        renderImmediately: renderImmediately ?? (() => undefined),
    });
}

describe("ScaleInteractionController", () => {
    test.each(
        /** @type {const} */ ([
            {
                type: "index",
                paddingInner: 0,
                paddingOuter: 0,
                align: 0.5,
                reverse: false,
                anchor: 0.25,
            },
            {
                type: "index",
                paddingInner: 0.5,
                paddingOuter: 0.5,
                align: 0.5,
                reverse: false,
                anchor: 0.5,
            },
            {
                type: "index",
                paddingInner: 0.5,
                paddingOuter: 0.5,
                align: 1,
                reverse: true,
                anchor: 0.25,
            },
            {
                type: "index",
                paddingInner: 0.8,
                paddingOuter: 0.1,
                align: 1,
                reverse: false,
                anchor: 0.25,
            },
            {
                type: "locus",
                paddingInner: 0.2,
                paddingOuter: 0.4,
                align: 0,
                reverse: true,
                anchor: 0.75,
            },
        ])
    )(
        "$type zoom preserves the pointer coordinate with inner=$paddingInner, outer=$paddingOuter, align=$align, reverse=$reverse",
        async ({
            type,
            paddingInner,
            paddingOuter,
            align,
            reverse,
            anchor,
        }) => {
            const { view } = await createHeadlessEngine({
                genomes: {
                    test: { contigs: [{ name: "chr1", size: 100 }] },
                },
                assembly: "test",
                data: { values: [{ pos: 1 }] },
                mark: "point",
                encoding: {
                    x: {
                        field: "pos",
                        type,
                        scale: {
                            domain: [0, 9],
                            zoom: true,
                            paddingInner,
                            paddingOuter,
                            align,
                            reverse,
                        },
                        axis: /** @type {null} */ (null),
                    },
                },
            });
            try {
                const resolution = view.getScaleResolution("x");
                const scale =
                    /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
                        resolution.getScale()
                    );
                const coordinate = scale.invert(anchor);

                // Cross the minimum step and domain spans as well as ordinary zoom levels.
                for (const factor of [0.5, 0.3, 0.5]) {
                    const before = scale.domain();
                    expect(resolution.zoom(factor, anchor, 0)).toBe(true);
                    const after = scale.domain();

                    expect(after[1] - after[0]).toBeCloseTo(
                        Math.max(1, (before[1] - before[0]) * factor)
                    );
                    expect(scale.invert(anchor)).toBeCloseTo(coordinate);
                }

                const beforePan = scale.domain();
                expect(resolution.zoom(1, anchor, 0.1)).toBe(true);
                const afterPan = scale.domain();
                const shift = reverse ? 0.1 : -0.1;
                expect(afterPan[0]).toBeCloseTo(beforePan[0] + shift);
                expect(afterPan[1]).toBeCloseTo(beforePan[1] + shift);
            } finally {
                view.disposeSubtree();
            }
        }
    );

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
