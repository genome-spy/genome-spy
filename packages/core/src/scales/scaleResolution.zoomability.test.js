import { describe, expect, test, vi } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import * as resolutionMemberOrder from "./resolutionMemberOrder.js";
import ScaleResolution from "./scaleResolution.js";

/**
 * @param {object} options
 * @param {string} options.path
 * @param {import("../spec/channel.js").ChannelWithScale} [options.channel]
 * @param {import("../spec/channel.js").Type} [options.type]
 * @param {boolean} [options.zoom]
 * @returns {import("./scaleResolution.js").ScaleResolutionMember}
 */
function createMember({ path, channel = "x", type = "index", zoom }) {
    return /** @type {import("./scaleResolution.js").ScaleResolutionMember} */ ({
        channel,
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
            type,
            scale: zoom === undefined ? undefined : { zoom },
        },
        contributesToDomain: true,
    });
}

/**
 * @param {object} options
 * @param {number} options.foo
 * @returns {import("../view/view.js").default}
 */
function createHostView({ foo }) {
    const paramRuntime = new ViewParamRuntime();
    paramRuntime.registerParam({ name: "foo", value: foo });

    const hostView = /** @type {any} */ ({
        context: {
            animator: {},
            genomeStore: undefined,
        },
        /** @returns {import("../spec/config.js").GenomeSpyConfig[]} */
        getConfigScopes() {
            return [];
        },
        /** @returns {import("../view/view.js").default[]} */
        getLayoutAncestors() {
            return [hostView];
        },
        paramRuntime,
    });

    return hostView;
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

    test("binds range expressions through the contributing member view", () => {
        const hostView = createHostView({ foo: 10 });
        const resolution = new ScaleResolution("shape", hostView);
        const memberRuntime = new ViewParamRuntime(() => hostView.paramRuntime);
        memberRuntime.registerParam({ name: "bar", value: 2 });

        resolution.registerMember(
            /** @type {import("./scaleResolution.js").ScaleResolutionMember} */ ({
                channel: "shape",
                view: /** @type {any} */ ({
                    /** @returns {import("../spec/config.js").GenomeSpyConfig[]} */
                    getConfigScopes() {
                        return [];
                    },
                    getPathString: () => "root/a",
                    isConfiguredVisible: () => true,
                    isDataInitialized: () => true,
                    paramRuntime: memberRuntime,
                }),
                channelDef: {
                    field: "value",
                    type: "nominal",
                    scale: {},
                },
                contributesToDomain: true,
            })
        );
        resolution.registerMember(
            /** @type {import("./scaleResolution.js").ScaleResolutionMember} */ ({
                channel: "shape",
                view: /** @type {any} */ ({
                    /** @returns {import("../spec/config.js").GenomeSpyConfig[]} */
                    getConfigScopes() {
                        return [];
                    },
                    getPathString: () => "root/b",
                    isConfiguredVisible: () => true,
                    isDataInitialized: () => true,
                    paramRuntime: memberRuntime,
                }),
                channelDef: {
                    type: "nominal",
                    scale: {
                        domain: [0, 1],
                        range: [
                            { expr: "'c' + (foo + bar)" },
                            { expr: "'c' + (foo + bar + 1)" },
                        ],
                    },
                },
                contributesToDomain: true,
            })
        );

        expect(resolution.getScale().range()).toEqual(["c12", "c13"]);
    });
});
