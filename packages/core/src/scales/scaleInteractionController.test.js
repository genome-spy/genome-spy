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
        transition: vi.fn(async () => undefined),
        requestRender: vi.fn(),
    });
}

/**
 * @param {object} [options]
 * @param {ReturnType<typeof createLinearScale>} [options.scale]
 * @param {ReturnType<typeof createAnimator>} [options.animator]
 * @param {() => void} [options.renderImmediately]
 * @param {() => number[]} [options.getGenomeExtent]
 */
function createController({
    scale,
    animator,
    renderImmediately,
    getGenomeExtent,
} = {}) {
    return new ScaleInteractionController({
        getScale: () => scale ?? createLinearScale([0, 10]),
        getAnimator: () => animator ?? createAnimator(),
        getInitialDomainSnapshot: () => [0, 10],
        getResetDomain: () => [0, 10],
        fromComplexInterval: /** @returns {number[]} */ (
            /** @type {any} */ interval
        ) => interval,
        getGenomeExtent: getGenomeExtent ?? (() => [0, 10]),
        renderImmediately: renderImmediately ?? (() => undefined),
    });
}

describe("ScaleInteractionController", () => {
    test("zoom updates domain and notifies", () => {
        const scale = createLinearScale([0, 10]);
        const notify = vi.fn();
        const controller = createController({ scale });

        const changed = controller.zoom(0.5, 5, 0);
        expect(changed).toBe(true);
        expect(scale.domain()).toEqual([2.5, 7.5]);
        expect(notify).not.toHaveBeenCalled();
    });

    test("resetZoom restores the reset domain", () => {
        const scale = createLinearScale([2, 8]);
        const notify = vi.fn();
        const controller = createController({ scale });

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

    test("isZoomed is true only when current domain differs from reset domain", () => {
        const scale = createLinearScale([0, 10]);
        const controller = createController({ scale });

        expect(controller.isZoomed()).toBe(false);
        scale.domain([2, 8]);
        expect(controller.isZoomed()).toBe(true);
    });

    test("zoomTo accepts options object with duration", async () => {
        const scale = createLinearScale([0, 10]);
        const animator = createAnimator();
        const controller = createController({ scale, animator });

        await controller.zoomTo([2, 8], { duration: 0 });

        expect(scale.domain()).toEqual([2, 8]);
        expect(animator.requestRender).toHaveBeenCalledTimes(1);
    });

    test("zoomTo still accepts direct duration for compatibility", async () => {
        const scale = createLinearScale([0, 10]);
        const animator = createAnimator();
        const controller = createController({ scale, animator });

        await controller.zoomTo([2, 8], 500);

        expect(animator.transition).toHaveBeenCalledWith(
            expect.objectContaining({ duration: 500 })
        );
    });

    test("zoomTo can render immediately without requesting animation frame", async () => {
        const scale = createLinearScale([0, 10]);
        const animator = createAnimator();
        const renderImmediately = vi.fn();
        const controller = createController({
            scale,
            animator,
            renderImmediately,
        });

        await controller.zoomTo([2, 8], {
            duration: 0,
            renderImmediately: true,
        });

        expect(scale.domain()).toEqual([2, 8]);
        expect(renderImmediately).toHaveBeenCalledTimes(1);
        expect(animator.requestRender).not.toHaveBeenCalled();
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
