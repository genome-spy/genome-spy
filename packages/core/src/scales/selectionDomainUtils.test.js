import { describe, expect, test } from "vitest";

import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import {
    findIntervalSelectionBindingOwners,
    normalizeIntervalForSelection,
    resolveIntervalSelectionBinding,
} from "./selectionDomainUtils.js";

class FakeView {
    /** @type {FakeView | undefined} */
    parent;

    /** @type {string} */
    name;

    /** @type {FakeView[]} */
    children;

    /** @type {ViewParamRuntime} */
    paramRuntime;

    /**
     * @param {FakeView | undefined} parent
     * @param {string} name
     */
    constructor(parent, name) {
        this.parent = parent;
        this.name = name;
        this.children = [];
        this.paramRuntime = new ViewParamRuntime(() => parent?.paramRuntime);

        if (parent) {
            parent.children.push(this);
        }
    }

    getLayoutAncestors() {
        /** @type {FakeView[]} */
        const ancestors = [];
        /** @type {FakeView | undefined} */
        let current = this;
        while (current) {
            ancestors.push(current);
            current = current.parent;
        }
        return ancestors;
    }

    /**
     * @param {(view: FakeView) => void} visitor
     */
    visit(visitor) {
        visitor(this);
        for (const child of this.children) {
            child.visit(visitor);
        }
    }
}

describe("selectionDomainUtils", () => {
    test("index brush edges snap at band centers in either drag direction", () => {
        /** @param {[number, number]} interval */
        const snap = (interval) =>
            normalizeIntervalForSelection(interval, [0, 20], {
                roundToIntegers: true,
            });

        expect(snap([6.2, 6.4])).toEqual([6, 6]);
        expect(snap([6.2, 6.6])).toEqual([6, 7]);
        expect(snap([6.8, 6.4])).toEqual([6, 7]);
        expect(snap([6.8, 7.4])).toEqual([7, 7]);
        expect(snap([6.8, 7.6])).toEqual([7, 8]);
    });

    test("resolves same-named interval bindings by runtime identity instead of name", () => {
        const root = new FakeView(undefined, "root");
        root.paramRuntime.registerParam({ name: "brush", value: null });

        const overview = new FakeView(root, "overview");
        overview.paramRuntime.registerParam({
            name: "brush",
            select: {
                type: "interval",
                encodings: ["x"],
            },
            push: "outer",
        });

        const detail = new FakeView(root, "detail");

        const otherPanel = new FakeView(root, "otherPanel");
        otherPanel.paramRuntime.registerParam({
            name: "brush",
            select: {
                type: "interval",
                encodings: ["x"],
            },
            persist: false,
        });

        const nestedDetail = new FakeView(otherPanel, "nestedDetail");

        // Non-obvious: the overview brush pushes into the root runtime, while the
        // other panel owns a distinct local runtime with the same param name.
        const rootBinding = resolveIntervalSelectionBinding(
            /** @type {any} */ (detail),
            "brush",
            "x"
        );
        const localBinding = resolveIntervalSelectionBinding(
            /** @type {any} */ (nestedDetail),
            "brush",
            "x"
        );
        const rootOwners = findIntervalSelectionBindingOwners(
            /** @type {any} */ (root),
            rootBinding.runtime,
            "brush",
            "x"
        );
        const localOwners = findIntervalSelectionBindingOwners(
            /** @type {any} */ (root),
            localBinding.runtime,
            "brush",
            "x"
        );

        expect(rootBinding.runtime).toBe(root.paramRuntime);
        expect(rootOwners.map((owner) => owner.view.name)).toEqual([
            "overview",
        ]);

        expect(localBinding.runtime).toBe(otherPanel.paramRuntime);
        expect(localOwners.map((owner) => owner.view.name)).toEqual([
            "otherPanel",
        ]);
    });
});
