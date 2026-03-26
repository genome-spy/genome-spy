import { describe, expect, test, vi } from "vitest";
import AxisResolution from "./axisResolution.js";
import { orderResolutionMembers } from "./resolutionMemberOrder.js";
import { resolveScalePropsBase } from "./scalePropsResolver.js";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";

/**
 * @param {object} options
 * @param {string} options.path
 * @param {string} options.tickColor
 * @param {string} options.title
 * @param {any} options.sharedScaleResolution
 */
function createAxisMember({ path, tickColor, title, sharedScaleResolution }) {
    return {
        view: {
            getScaleResolution: () => sharedScaleResolution,
            getPathString: () => path,
            mark: {
                encoding: {
                    x: {
                        field: "value",
                        type: "quantitative",
                        axis: {
                            tickColor,
                            title,
                        },
                    },
                },
            },
        },
        channel: "x",
        channelDef: {
            field: "value",
            type: "quantitative",
        },
    };
}

/**
 * @param {string} path
 * @param {string} scheme
 */
function createScaleMember(path, scheme) {
    return /** @type {import("./scaleResolution.js").ScaleResolutionMember} */ ({
        channel: "color",
        view: {
            getPathString: () => path,
        },
        channelDef: {
            type: "nominal",
            scale: {
                scheme,
            },
        },
        contributesToDomain: true,
    });
}

describe("deterministic shared resolution merges", () => {
    test("axis props and explicit title do not depend on member registration order", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {
            // Ignore expected conflict warning for this test.
        });

        const memberA = createAxisMember({
            path: "root/a",
            tickColor: "red",
            title: "Title A",
            sharedScaleResolution: {},
        });
        const memberB = createAxisMember({
            path: "root/b",
            tickColor: "blue",
            title: "Title B",
            sharedScaleResolution: memberA.view.getScaleResolution(),
        });

        /** @param {any[]} members */
        const create = (members) => {
            const resolution = new AxisResolution("x");
            for (const member of members) {
                resolution.registerMember(member);
            }
            return {
                axisProps: resolution.getAxisProps(),
                title: resolution.getTitle(),
            };
        };

        const forward = create([memberA, memberB]);
        const reverse = create([memberB, memberA]);

        expect(forward.axisProps.tickColor).toBe("red");
        expect(reverse.axisProps.tickColor).toBe("red");
        expect(forward.title).toBe("Title A");
        expect(reverse.title).toBe("Title A");

        warn.mockRestore();
    });

    test("scale props do not depend on member registration order", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {
            // Ignore expected conflict warning for this test.
        });

        const memberA = createScaleMember("root/a", "viridis");
        const memberB = createScaleMember("root/b", "blues");

        /** @param {import("./scaleResolution.js").ScaleResolutionMember[]} members */
        const resolve = (members) =>
            resolveScalePropsBase({
                channel: "color",
                dataType: "nominal",
                // `resolveScalePropsBase()` now expects the caller to provide the
                // canonical member order, which production gets from
                // ScaleResolution before merging scale props.
                orderedMembers: orderResolutionMembers(new Set(members)),
                isExplicitDomain: false,
                configScopes: [INTERNAL_DEFAULT_CONFIG],
            });

        const forward = resolve([memberA, memberB]);
        const reverse = resolve([memberB, memberA]);

        expect(forward.scheme).toBe("viridis");
        expect(reverse.scheme).toBe("viridis");

        warn.mockRestore();
    });
});
