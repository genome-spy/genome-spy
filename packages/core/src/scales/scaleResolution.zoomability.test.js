import { describe, expect, test, vi } from "vitest";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import * as resolutionMemberOrder from "./resolutionMemberOrder.js";
import ScaleResolution from "./scaleResolution.js";

/**
 * @param {object} options
 * @param {string} options.path
 * @param {import("../spec/channel.js").ChannelWithScale} [options.channel]
 * @param {import("../spec/channel.js").Type} [options.type]
 * @param {import("../spec/scale.js").Scale["zoom"]} [options.zoom]
 * @returns {import("./scaleResolution.js").ScaleResolutionMember}
 */
function createMember({ path, channel = "x", type = "index", zoom }) {
    return /** @type {import("./scaleResolution.js").ScaleResolutionMember} */ ({
        channel,
        // Minimal fake view for resolving scale properties and zoomability.
        view: /** @type {any} */ ({
            getBaseUrl: () => "",
            getConfigScopes: () => [INTERNAL_DEFAULT_CONFIG],
            getEncoding: () => ({}),
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

    test("identifies explicitly configured bounded zoom extents", () => {
        const resolution = new ScaleResolution("x");
        resolution.registerMember(
            createMember({
                path: "root/a",
                zoom: { extent: [1, 100] },
            })
        );

        expect(resolution.hasConfiguredZoomExtent()).toBe(true);
    });

    test.each(
        /** @type {import("../spec/scale.js").Scale["zoom"][]} */ ([
            true,
            { extent: "unbounded" },
        ])
    )("does not identify %j as a bounded configured zoom extent", (zoom) => {
        const resolution = new ScaleResolution("x");
        resolution.registerMember(createMember({ path: "root/a", zoom }));

        expect(resolution.hasConfiguredZoomExtent()).toBe(false);
    });

    test("binds range expressions through the resolution owner", async () => {
        const { view } = await createHeadlessEngine({
            params: [
                { name: "foo", value: 10 },
                { name: "bar", value: 2 },
            ],
            data: { values: [{ category: "a" }, { category: "b" }] },
            layer: [
                {
                    params: [{ name: "bar", value: 20 }],
                    mark: "point",
                    encoding: {
                        shape: { field: "category", type: "nominal" },
                    },
                },
                {
                    mark: "point",
                    encoding: {
                        shape: {
                            field: "category",
                            type: "nominal",
                            scale: {
                                domain: ["a", "b"],
                                range: [
                                    {
                                        expr: "foo + bar == 12 ? 'circle' : 'cross'",
                                    },
                                    {
                                        expr: "foo + bar == 12 ? 'square' : 'cross'",
                                    },
                                ],
                            },
                        },
                    },
                },
            ],
        });
        try {
            const resolution = view.getScaleResolution("shape");
            expect(resolution.getScale().range()).toEqual(["circle", "square"]);
            view.paramRuntime.setValue("foo", 11);
            expect(resolution.getScale().range()).toEqual(["cross", "cross"]);
        } finally {
            view.disposeSubtree();
        }
    });

    test("disposed scales stop following configured-domain parameters", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "category", value: "b" }],
            data: { values: [{ category: "a" }] },
            mark: "point",
            encoding: {
                color: {
                    field: "category",
                    type: "nominal",
                    scale: {
                        domain: { expr: "['a', category]" },
                        range: ["red", "blue"],
                    },
                },
            },
        });
        try {
            const resolution = view.getScaleResolution("color");
            const scale = resolution.getScale();
            expect(scale.domain()).toEqual(["a", "b"]);
            view.paramRuntime.setValue("category", "d");
            expect(scale.domain()).toEqual(["a", "d"]);
            const notify = vi.fn();
            resolution.addEventListener("domain", notify);
            resolution.dispose();
            resolution.dispose();

            view.paramRuntime.setValue("category", "c");
            expect(scale.domain()).toEqual(["a", "d"]);
            expect(notify).not.toHaveBeenCalled();
        } finally {
            view.disposeSubtree();
        }
    });
});
