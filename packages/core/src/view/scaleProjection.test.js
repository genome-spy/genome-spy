import { describe, expect, test } from "vitest";
import Rectangle from "./layout/rectangle.js";
import { getScaleProjectionCoords } from "./scaleProjection.js";

/** @typedef {{ visible?: boolean, inScope?: boolean }} MemberOptions */

/**
 * @param {number} x
 * @param {number} width
 * @param {object} scope
 * @param {MemberOptions} [options]
 */
function createMember(x, width, scope, options = {}) {
    const view = /** @type {any} */ ({
        coords: Rectangle.create(x, 0, width, 100),
        isVisible: () => options.visible ?? true,
        getLayoutAncestors: () => (options.inScope === false ? [] : [scope]),
        layoutParent: null,
    });

    return { view };
}

describe("scale projections", () => {
    test("only includes visible plot members in the requested layout scope", () => {
        const scope = {};
        const scaleResolution = {
            getOrderedMembers: () => [
                createMember(10, 100, scope),
                createMember(30, 80, scope, { visible: false }),
                createMember(200, 50, scope, { inScope: false }),
            ],
        };

        const projection = getScaleProjectionCoords(
            /** @type {any} */ (scaleResolution),
            "x",
            Rectangle.create(0, 0, 300, 100),
            /** @type {any} */ (scope)
        );

        expect(projection.x).toBe(10);
        expect(projection.width).toBe(100);
    });
});
