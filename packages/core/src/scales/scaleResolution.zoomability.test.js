import { describe, expect, test, vi } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import * as resolutionMemberOrder from "./resolutionMemberOrder.js";
import ScaleResolution from "./scaleResolution.js";

/**
 * @param {object} options
 * @param {string} options.path
 * @param {boolean} [options.zoom]
 * @returns {import("./scaleResolution.js").ScaleResolutionMember}
 */
function createMember({ path, zoom }) {
    return /** @type {import("./scaleResolution.js").ScaleResolutionMember} */ ({
        channel: "x",
        // Minimal fake view: `isZoomable()` only needs config scopes and a stable path.
        view: /** @type {any} */ ({
            getBaseUrl: () => "",
            getConfigScopes: () => [INTERNAL_DEFAULT_CONFIG],
            getPathString: () => path,
            isConfiguredVisible: () => true,
            isDataInitialized: () => true,
        }),
        channelDef: {
            field: "value",
            type: "index",
            scale: zoom === undefined ? undefined : { zoom },
        },
        contributesToDomain: true,
    });
}

describe("scale resolution zoomability", () => {
    test("reuses merged scale props across repeated zoomability checks", () => {
        const orderSpy = vi.spyOn(
            resolutionMemberOrder,
            "orderResolutionMembers"
        );
        const resolution = new ScaleResolution("x");
        resolution.registerMember(createMember({ path: "root/a" }));

        orderSpy.mockClear();

        expect(resolution.isZoomable()).toBe(true);
        expect(resolution.getResolvedScaleType()).toBe("index");
        expect(resolution.isZoomable()).toBe(true);
        expect(orderSpy).toHaveBeenCalledTimes(1);
    });

    test("invalidates cached zoomability props when members change", () => {
        const orderSpy = vi.spyOn(
            resolutionMemberOrder,
            "orderResolutionMembers"
        );
        const resolution = new ScaleResolution("x");
        resolution.registerMember(createMember({ path: "root/a" }));

        expect(resolution.isZoomable()).toBe(true);
        orderSpy.mockClear();

        resolution.registerMember(createMember({ path: "root/b", zoom: true }));

        expect(resolution.isZoomable()).toBe(true);
        expect(orderSpy).toHaveBeenCalledTimes(1);
    });
});
