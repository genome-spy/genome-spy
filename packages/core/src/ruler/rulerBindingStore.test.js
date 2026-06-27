import { describe, expect, test } from "vitest";
import { createRulerBindingStore } from "./rulerBindingStore.js";

describe("ruler binding store", () => {
    test("refreshes bindings after a child is inserted", () => {
        const children = [];
        const root = createView("root", children);
        root.paramRuntime.paramConfigs.set("cursor", {
            name: "cursor",
            ruler: { encodings: ["x"] },
        });
        const store = createRulerBindingStore(root);

        expect(store.getBindings()[0].participants).toHaveLength(0);

        children.push(createView("inserted", [], { x: createResolution() }));
        store.refresh();

        expect(
            store.getBindings()[0].participants.map((p) => p.view.name)
        ).toEqual(["inserted"]);
    });

    test("refreshes bindings after a child is removed", () => {
        const removed = createView("removed", [], { x: createResolution() });
        const children = [removed];
        const root = createView("root", children);
        root.paramRuntime.paramConfigs.set("cursor", {
            name: "cursor",
            ruler: { encodings: ["x"] },
        });
        const store = createRulerBindingStore(root);

        children.pop();
        store.refresh();

        expect(store.getBindings()[0].participants).toHaveLength(0);
    });
});

/**
 * @param {string} name
 * @param {any[]} [children]
 * @param {Record<string, any>} [resolutions]
 */
function createView(name, children = [], resolutions = {}) {
    return {
        name,
        spec: {},
        paramRuntime: {
            paramConfigs: new Map(),
        },
        getScaleResolution(channel) {
            return resolutions[channel];
        },
        visit(visitor) {
            const result = visitor(this);
            if (result === "VISIT_SKIP") {
                return;
            }
            for (const child of children) {
                child.visit(visitor);
            }
        },
    };
}

function createResolution() {
    return {
        getResolvedScaleType() {
            return "linear";
        },
        getAssemblyRequirement() {
            return {
                assembly: undefined,
                needsDefaultAssembly: false,
            };
        },
    };
}
