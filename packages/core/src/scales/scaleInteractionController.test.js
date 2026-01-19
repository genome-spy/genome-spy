import { describe, expect, test, vi } from "vitest";

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

function createAnimator() {
    return /** @type {any} */ ({
        transition: /** @type {() => Promise<void>} */ (async () => undefined),
        requestRender: /** @type {() => void} */ () => undefined,
    });
}

describe("ScaleInteractionController", () => {
    test("zoom updates domain and notifies", () => {
        const scale = createLinearScale([0, 10]);
        const notify = vi.fn();
        const controller = new ScaleInteractionController({
            getScale: () => scale,
            getAnimator: () => createAnimator(),
            getInitialDomainSnapshot: () => [0, 10],
            getResetDomain: () => [0, 10],
            fromComplexInterval: /** @returns {number[]} */ (
                /** @type {any} */ interval
            ) => interval,
            getGenomeExtent: () => [0, 10],
        });

        const changed = controller.zoom(0.5, 5, 0);
        expect(changed).toBe(true);
        expect(scale.domain()).toEqual([2.5, 7.5]);
        expect(notify).not.toHaveBeenCalled();
    });

    test("resetZoom restores the reset domain", () => {
        const scale = createLinearScale([2, 8]);
        const notify = vi.fn();
        const controller = new ScaleInteractionController({
            getScale: () => scale,
            getAnimator: () => createAnimator(),
            getInitialDomainSnapshot: () => [0, 10],
            getResetDomain: () => [0, 10],
            fromComplexInterval: /** @returns {number[]} */ (
                /** @type {any} */ interval
            ) => interval,
            getGenomeExtent: () => [0, 10],
        });

        const changed = controller.resetZoom();
        expect(changed).toBe(true);
        expect(scale.domain()).toEqual([0, 10]);
        expect(notify).not.toHaveBeenCalled();
    });

    test("zoom extent uses explicit extent for locus scales", () => {
        const scale = createLinearScale([0, 10], {
            type: "locus",
            zoom: { extent: [1, 4] },
        });
        const controller = new ScaleInteractionController({
            getScale: () => scale,
            getAnimator: () => createAnimator(),
            getInitialDomainSnapshot: () => [0, 10],
            getResetDomain: () => [0, 10],
            fromComplexInterval: /** @returns {number[]} */ (
                /** @type {any} */ interval
            ) => interval,
            getGenomeExtent: () => [0, 10],
        });

        expect(controller.getZoomExtent()).toEqual([1, 4]);
    });

    test("zoom extent falls back to genome extent for locus scales", () => {
        const scale = createLinearScale([0, 10], {
            type: "locus",
            zoom: true,
        });
        const controller = new ScaleInteractionController({
            getScale: () => scale,
            getAnimator: () => createAnimator(),
            getInitialDomainSnapshot: () => [0, 10],
            getResetDomain: () => [0, 10],
            fromComplexInterval: /** @returns {number[]} */ (
                /** @type {any} */ interval
            ) => interval,
            getGenomeExtent: () => [0, 12],
        });

        expect(controller.getZoomExtent()).toEqual([0, 12]);
    });
});
