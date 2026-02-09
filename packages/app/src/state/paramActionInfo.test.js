import { describe, expect, it } from "vitest";
import ParamMediator from "@genome-spy/core/view/paramMediator.js";
import { VISIT_SKIP, VISIT_STOP } from "@genome-spy/core/view/view.js";
import { paramProvenanceSlice } from "./paramProvenanceSlice.js";
import { getParamActionInfo } from "./paramActionInfo.js";
import templateResultToString from "../utils/templateResultToString.js";

class FakeView {
    /** @type {string | undefined} */
    explicitName;

    /** @type {string | undefined} */
    name;

    /** @type {{ name?: string } | undefined} */
    spec;

    /** @type {string | undefined} */
    #title;

    /** @type {FakeView[]} */
    #children;

    /** @type {ParamMediator} */
    paramMediator;

    /** @type {ParamMediator} */
    paramRuntime;

    /** @type {{ getScale: () => object }} */
    #scaleResolution;

    /**
     * @param {object} [options]
     * @param {string} [options.explicitName]
     * @param {string} [options.title]
     * @param {string} [options.name]
     * @param {string} [options.specName]
     * @param {FakeView[]} [options.children]
     */
    constructor(options = {}) {
        this.explicitName = options.explicitName;
        this.name = options.name;
        this.spec = options.specName ? { name: options.specName } : undefined;
        this.#title = options.title;
        this.#children = options.children ? [...options.children] : [];
        this.paramMediator = new ParamMediator();
        this.paramRuntime = this.paramMediator;
        this.#scaleResolution = { getScale: () => ({}) };
    }

    /**
     * @returns {string | undefined}
     */
    getTitleText() {
        return this.#title;
    }

    /**
     * @param {string} _channel
     * @returns {{ getScale: () => object }}
     */
    getScaleResolution(_channel) {
        return this.#scaleResolution;
    }

    /**
     * @param {import("@genome-spy/core/view/view.js").Visitor} visitor
     * @returns {import("@genome-spy/core/view/view.js").VisitResult}
     */
    visit(visitor) {
        const result = visitor(this);
        if (result === VISIT_STOP) {
            return VISIT_STOP;
        }

        if (result === VISIT_SKIP) {
            return;
        }

        for (const child of this.#children) {
            if (child.visit(visitor) === VISIT_STOP) {
                return VISIT_STOP;
            }
        }
    }
}

/**
 * @param {import("./provenance.js").ActionInfo} info
 * @returns {string}
 */
function normalizeTitle(info) {
    return templateResultToString(info.title);
}

describe("getParamActionInfo", () => {
    it("formats value param titles with a view label", () => {
        const view = new FakeView({ title: "Overview", explicitName: "root" });
        view.paramMediator.registerParam({
            name: "threshold",
            value: 1,
            bind: { input: "range" },
        });

        const action = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "threshold" },
            value: { type: "value", value: 5 },
        });

        const info = getParamActionInfo(action, view);
        const title = normalizeTitle(info);

        expect(title).toContain("Set threshold = 5 in Overview");
    });

    it("formats point selection titles for clear and multi selections", () => {
        const view = new FakeView({ explicitName: "points" });
        view.paramMediator.registerParam({
            name: "selected",
            select: { type: "point", toggle: true },
        });

        const clearAction = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "selected" },
            value: { type: "point", keyFields: ["id"], keys: [] },
        });
        const clearInfo = getParamActionInfo(clearAction, view);
        const clearTitle = normalizeTitle(clearInfo);

        expect(clearTitle).toContain("Clear selection selected in points");

        const multiAction = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "selected" },
            value: {
                type: "point",
                keyFields: ["id"],
                keys: [["a"], ["b"]],
            },
        });
        const multiInfo = getParamActionInfo(multiAction, view);
        const multiTitle = normalizeTitle(multiInfo);

        expect(multiTitle).toContain("Select selected (2 points) in points");
    });

    it("formats interval selections with x and y ranges", () => {
        const view = new FakeView({ explicitName: "intervals" });
        view.paramMediator.registerParam({
            name: "brush",
            select: { type: "interval", encodings: ["x", "y"] },
        });

        const action = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "brush" },
            value: {
                type: "interval",
                intervals: { x: [1, 2], y: [3, 4] },
            },
        });

        const info = getParamActionInfo(action, view);
        const title = normalizeTitle(info);

        expect(title).toContain("Brush brush");
        expect(title).toContain("x: 1 \u2013 2");
        expect(title).toContain("y: 3 \u2013 4");
    });

    it("includes origin suffix when the origin view can be resolved", () => {
        const root = new FakeView();
        const view = new FakeView({ title: "Main", explicitName: "main" });
        view.paramMediator.registerParam({
            name: "brush",
            select: { type: "interval", encodings: ["x"] },
        });

        const originView = new FakeView({
            title: "Origin",
            explicitName: "origin-view",
        });

        root.visit = (visitor) => {
            const result = visitor(root);
            if (result === VISIT_STOP) {
                return VISIT_STOP;
            }

            if (result === VISIT_SKIP) {
                return;
            }

            if (view.visit(visitor) === VISIT_STOP) {
                return VISIT_STOP;
            }
            return originView.visit(visitor);
        };

        const action = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "brush" },
            value: { type: "interval", intervals: { x: [1, 2] } },
            origin: {
                type: "datum",
                view: { scope: [], view: "origin-view" },
                keyField: "id",
                key: "X",
            },
        });

        const info = getParamActionInfo(action, root);
        const title = normalizeTitle(info);

        expect(title).toContain("from Origin");
        expect(title).toContain("in Main");
    });

    it("falls back to explicit view names when titles are missing", () => {
        const view = new FakeView({
            explicitName: "ExplicitView",
            specName: "SpecName",
        });
        view.paramMediator.registerParam({
            name: "alpha",
            value: 0.2,
            bind: { input: "range" },
        });

        const action = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "alpha" },
            value: { type: "value", value: 0.75 },
        });

        const info = getParamActionInfo(action, view);
        const title = normalizeTitle(info);

        expect(title).toContain("in ExplicitView");
        expect(title).not.toContain("SpecName");
    });
});
