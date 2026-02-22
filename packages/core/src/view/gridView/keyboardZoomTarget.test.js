import { describe, expect, test } from "vitest";

import {
    getKeyboardZoomTarget,
    getZoomableResolutions,
} from "./zoomNavigationUtils.js";

/**
 * @typedef {object} MockView
 * @prop {MockView[]} children
 * @prop {(channel: string) => any} getScaleResolution
 * @prop {(visitor: (view: MockView) => void) => void} visit
 */

/**
 * @param {string} id
 * @param {boolean} [zoomable]
 */
function createResolution(id, zoomable = true) {
    return {
        id,
        isZoomable: () => zoomable,
    };
}

/**
 * @param {object} options
 * @param {any} [options.xResolution]
 * @param {any} [options.yResolution]
 * @param {any} [options.lookupXResolution]
 * @param {MockView[]} [options.children]
 * @returns {MockView}
 */
function createMockView({
    xResolution,
    yResolution,
    lookupXResolution = xResolution,
    children = [],
}) {
    return {
        children,

        getScaleResolution(channel) {
            if (channel === "x") {
                return lookupXResolution;
            } else if (channel === "y") {
                return yResolution;
            } else {
                return undefined;
            }
        },

        visit(visitor) {
            visitor(this);
            for (const child of this.children) {
                child.visit(visitor);
            }
        },
    };
}

/**
 * @param {MockView} root
 */
function collectZoomableXResolutions(root) {
    return [...getZoomableResolutions(/** @type {any} */ (root)).x];
}

describe("getKeyboardZoomTarget", () => {
    test("returns undefined when no zoomable x resolution exists", () => {
        const nonZoomableX = createResolution("x0", false);
        const root = createMockView({
            xResolution: nonZoomableX,
            yResolution: createResolution("y0"),
        });

        expect(collectZoomableXResolutions(root)).toEqual([]);
        expect(
            getKeyboardZoomTarget(/** @type {any} */ (root))
        ).toBeUndefined();
    });

    test("returns undefined when a single zoomable x is not resolved to root", () => {
        const target = createResolution("x1");
        const child = createMockView({ xResolution: target });
        const root = createMockView({
            children: [child],
            lookupXResolution: undefined,
        });

        expect(collectZoomableXResolutions(root)).toEqual([target]);
        expect(
            getKeyboardZoomTarget(/** @type {any} */ (root))
        ).toBeUndefined();
    });

    test("returns undefined when multiple zoomable x resolutions exist", () => {
        const rootTarget = createResolution("x_root");
        const childTarget = createResolution("x_child");
        const root = createMockView({
            xResolution: rootTarget,
            children: [createMockView({ xResolution: childTarget })],
        });

        expect(collectZoomableXResolutions(root)).toEqual([
            rootTarget,
            childTarget,
        ]);
        expect(
            getKeyboardZoomTarget(/** @type {any} */ (root))
        ).toBeUndefined();
    });

    test("returns the single root-resolved zoomable x resolution", () => {
        const target = createResolution("x_shared");
        const root = createMockView({
            xResolution: target,
            children: [createMockView({ xResolution: target })],
        });

        expect(collectZoomableXResolutions(root)).toEqual([target]);
        expect(getKeyboardZoomTarget(/** @type {any} */ (root))).toBe(target);
    });
});
