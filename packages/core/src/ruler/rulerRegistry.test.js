import { describe, expect, test } from "vitest";
import { markViewAsChrome } from "../view/viewSelectors.js";
import { resolveRulerBindings } from "./rulerRegistry.js";

describe("ruler registry", () => {
    test("resolves compatible non-chrome descendants as participants", () => {
        const root = createView("root", [
            createView("a", [], { x: createResolution("linear") }),
            createView("b", [], { x: createResolution("linear") }),
            createView("c", [], { x: createResolution("index") }),
        ]);
        root.paramRuntime.paramConfigs.set("cursor", {
            name: "cursor",
            ruler: { encodings: ["x"] },
        });

        const bindings = resolveRulerBindings(root);

        expect(bindings).toHaveLength(1);
        expect(bindings[0]).toMatchObject({
            owner: root,
            paramName: "cursor",
            channels: ["x"],
            extent: { type: "view" },
        });
        expect(bindings[0].participants.map((p) => p.view.name)).toEqual([
            "a",
            "b",
        ]);
    });

    test("excludes chrome views before compatibility checks", () => {
        const chrome = createView("axis", [], {
            x: createResolution("linear"),
        });
        markViewAsChrome(chrome);

        const root = createView("root", [
            chrome,
            createView("plot", [], { x: createResolution("linear") }),
        ]);
        root.paramRuntime.paramConfigs.set("cursor", {
            name: "cursor",
            ruler: { encodings: ["x"] },
        });

        const bindings = resolveRulerBindings(root);

        expect(bindings[0].participants.map((p) => p.view.name)).toEqual([
            "plot",
        ]);
    });

    test("descendant same-name ruler shadows ancestor binding", () => {
        const descendant = createView("descendant", [], {
            x: createResolution("linear"),
        });
        descendant.paramRuntime.paramConfigs.set("cursor", {
            name: "cursor",
            ruler: { encodings: ["x"] },
        });

        const sibling = createView("sibling", [], {
            x: createResolution("linear"),
        });
        const root = createView("root", [descendant, sibling]);
        root.paramRuntime.paramConfigs.set("cursor", {
            name: "cursor",
            ruler: { encodings: ["x"] },
        });

        const bindings = resolveRulerBindings(root);

        expect(bindings).toHaveLength(2);
        expect(bindings[0].participants.map((p) => p.view.name)).toEqual([
            "sibling",
        ]);
        expect(bindings[1].participants.map((p) => p.view.name)).toEqual([
            "descendant",
        ]);
    });

    test("rejects overlapping differently named ruler bindings", () => {
        const child = createView("child", [], {
            x: createResolution("linear"),
        });
        const root = createView("root", [child]);
        root.paramRuntime.paramConfigs.set("first", {
            name: "first",
            ruler: { encodings: ["x"] },
        });
        root.paramRuntime.paramConfigs.set("second", {
            name: "second",
            ruler: { encodings: ["x"] },
        });

        expect(() => resolveRulerBindings(root)).toThrow(
            'Multiple ruler parameters would apply to view "child" on channel "x": first, second.'
        );
    });

    test("resolves auto extent to container for aligned vconcat x rulers", () => {
        const resolution = createResolution("linear");
        const root = createView(
            "root",
            [
                createView("a", [], { x: resolution }),
                createView("b", [], { x: resolution }),
            ],
            {},
            { vconcat: [] }
        );
        root.paramRuntime.paramConfigs.set("cursor", {
            name: "cursor",
            ruler: { encodings: ["x"], extent: "auto" },
        });

        const bindings = resolveRulerBindings(root);

        expect(bindings[0].extent).toEqual({ type: "container", channel: "x" });
    });
});

/**
 * @param {string} name
 * @param {any[]} [children]
 * @param {Record<string, any>} [resolutions]
 * @param {any} [spec]
 * @returns {any}
 */
function createView(name, children = [], resolutions = {}, spec = {}) {
    const view = /** @type {any} */ ({
        name,
        spec,
        paramRuntime: {
            paramConfigs: new Map(),
        },
        getScaleResolution(/** @type {string} */ channel) {
            return resolutions[channel];
        },
        visit(/** @type {(view: any) => unknown} */ visitor) {
            const result = visitor(this);
            if (result === "VISIT_SKIP") {
                return;
            }
            for (const child of children) {
                child.visit(visitor);
            }
        },
    });

    return view;
}

/**
 * @param {string} type
 * @returns {any}
 */
function createResolution(type) {
    return /** @type {any} */ ({
        getResolvedScaleType() {
            return type;
        },
        getAssemblyRequirement() {
            return {
                assembly: /** @type {undefined} */ (undefined),
                needsDefaultAssembly: false,
            };
        },
    });
}
