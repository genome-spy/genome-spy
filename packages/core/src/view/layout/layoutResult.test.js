import { expect, test } from "vitest";

import ViewRenderingContext from "../renderingContext/viewRenderingContext.js";
import Rectangle from "./rectangle.js";
import { createLayoutResult } from "./layoutResult.js";

test("records and replays ordered layout operations", () => {
    const child = createView("child");
    const mark = createMark();
    const root = createView("root", (context, coords, options) => {
        expect(context.getDevicePixelRatio()).toBe(1.5);
        expect(options).toEqual({ firstFacet: true });

        context.pushView(root, coords);
        context.beginSampleFacetBatch();
        context.pushView(child, coords);
        context.renderMark(mark, { facetId: ["sample-1"] });
        context.popView(child);
        context.endSampleFacetBatch();
        context.popView(root);
    });

    const result = createLayoutResult(root, Rectangle.create(0, 0, 100, 50), {
        devicePixelRatio: 1.5,
        renderingOptions: { firstFacet: true },
    });
    const context = new InspectRenderingContext();

    result.collectRenderCommands(context);

    expect(context.operations).toEqual([
        "push:root",
        "beginSampleFacetBatch",
        "push:child",
        "mark:sample-1",
        "pop:child",
        "endSampleFacetBatch",
        "pop:root",
    ]);
});

test("isolates option envelopes while preserving live geometry", () => {
    const mark = createMark();
    const locSize = { location: 0, size: 10 };
    const clipRect = Rectangle.create(0, 0, 100, 50);
    const options = {
        facetId: ["sample-1"],
        firstFacet: true,
        sampleFacetRenderingOptions: {
            locSize,
            pixelToUnit: 0.02,
        },
        clip: {
            rect: clipRect,
            clipX: true,
            clipY: false,
        },
    };
    const root = createView("root", (context, coords) => {
        context.pushView(root, coords);
        context.renderMark(mark, options);
        context.popView(root);
    });
    const coords = Rectangle.create(0, 0, 100, 50);
    const first = createLayoutResult(root, coords);

    options.facetId = ["sample-2"];
    options.firstFacet = false;
    options.sampleFacetRenderingOptions.pixelToUnit = 0.04;
    options.clip.clipX = false;
    locSize.location = 5;
    const second = createLayoutResult(root, coords);

    const firstOptions = collectRenderingOptions(first);
    const secondOptions = collectRenderingOptions(second);

    expect(firstOptions).toMatchObject({
        facetId: ["sample-1"],
        firstFacet: true,
        sampleFacetRenderingOptions: { pixelToUnit: 0.02 },
        clip: { clipX: true, clipY: false },
    });
    expect(secondOptions).toMatchObject({
        facetId: ["sample-2"],
        firstFacet: false,
        sampleFacetRenderingOptions: { pixelToUnit: 0.04 },
        clip: { clipX: false, clipY: false },
    });
    expect(firstOptions.sampleFacetRenderingOptions.locSize).toBe(locSize);
    expect(secondOptions.sampleFacetRenderingOptions.locSize).toBe(locSize);
    expect(firstOptions.sampleFacetRenderingOptions.locSize.location).toBe(5);
    expect(firstOptions.clip.rect).toBe(clipRect);
    expect(secondOptions.clip.rect).toBe(clipRect);
});

test("rejects unbalanced layout scopes", () => {
    const child = createView("child");
    const wrongView = createView("wrong");
    const unbalancedViews = createView("root", (context, coords) => {
        context.pushView(child, coords);
        context.popView(wrongView);
    });
    const unclosedBatch = createView("root", (context) => {
        context.beginSampleFacetBatch();
    });
    const coords = Rectangle.create(0, 0, 100, 50);

    expect(() => createLayoutResult(unbalancedViews, coords)).toThrow(
        "Unbalanced view scope"
    );
    expect(() => createLayoutResult(unclosedBatch, coords)).toThrow(
        "Unclosed sample facet batch scope"
    );
});

class InspectRenderingContext extends ViewRenderingContext {
    /** @type {string[]} */
    operations = [];

    /** @type {import("../../types/rendering.js").RenderingOptions[]} */
    renderingOptions = [];

    constructor() {
        super({ picking: false });
    }

    /** @override */
    beginSampleFacetBatch() {
        this.operations.push("beginSampleFacetBatch");
    }

    /** @override */
    endSampleFacetBatch() {
        this.operations.push("endSampleFacetBatch");
    }

    /**
     * @param {import("../view.js").default} view
     * @override
     */
    pushView(view) {
        this.operations.push("push:" + view.name);
    }

    /**
     * @param {import("../view.js").default} view
     * @override
     */
    popView(view) {
        this.operations.push("pop:" + view.name);
    }

    /**
     * @param {import("../../marks/mark.js").default} _mark
     * @param {import("../../types/rendering.js").RenderingOptions} options
     * @override
     */
    renderMark(_mark, options) {
        this.renderingOptions.push(options);
        this.operations.push("mark:" + options.facetId[0]);
    }
}

/**
 * @param {string} name
 * @param {(
 *     context: ViewRenderingContext,
 *     coords: Rectangle,
 *     options: import("../../types/rendering.js").RenderingOptions
 * ) => void} [render]
 * @returns {import("../view.js").default}
 */
function createView(name, render = () => undefined) {
    return /** @type {import("../view.js").default} */ (
        /** @type {unknown} */ ({ name, render })
    );
}

/** @returns {import("../../marks/mark.js").default} */
function createMark() {
    return /** @type {import("../../marks/mark.js").default} */ (
        /** @type {unknown} */ ({})
    );
}

/**
 * @param {import("./layoutResult.js").default} result
 * @returns {import("../../types/rendering.js").RenderingOptions}
 */
function collectRenderingOptions(result) {
    const context = new InspectRenderingContext();
    result.collectRenderCommands(context);
    return context.renderingOptions[0];
}
