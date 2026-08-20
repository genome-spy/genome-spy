import ViewRenderingContext from "../renderingContext/viewRenderingContext.js";

/** @typedef {import("../view.js").default} View */
/** @typedef {import("../../marks/mark.js").default} Mark */
/** @typedef {import("../../types/rendering.js").RenderingOptions} RenderingOptions */

/**
 * Performs one complete view traversal and returns its ordered semantic output.
 *
 * @param {View} viewRoot
 * @param {import("./rectangle.js").default} coords
 * @param {{
 *     devicePixelRatio?: number,
 *     renderingOptions?: RenderingOptions,
 * }} [options]
 */
export function createLayoutResult(
    viewRoot,
    coords,
    { devicePixelRatio = 1, renderingOptions = {} } = {}
) {
    const recorder = new LayoutRecorder(devicePixelRatio);
    viewRoot.render(recorder, coords, renderingOptions);
    return recorder.complete();
}

/**
 * Completed ordered output of one view layout traversal.
 */
export default class LayoutResult {
    /** @type {LayoutCommand[]} */
    #commands;

    /** @param {LayoutCommand[]} commands */
    constructor(commands) {
        this.#commands = commands;
    }

    /**
     * Replays the completed layout into a rendering context.
     *
     * @param {ViewRenderingContext} context
     */
    collectRenderCommands(context) {
        for (const command of this.#commands) {
            switch (command.type) {
                case "beginSampleFacetBatch":
                    context.beginSampleFacetBatch();
                    break;
                case "endSampleFacetBatch":
                    context.endSampleFacetBatch();
                    break;
                case "pushView":
                    context.pushView(command.view, command.coords);
                    break;
                case "popView":
                    context.popView(command.view);
                    break;
                case "renderMark":
                    context.renderMark(command.mark, command.options);
                    break;
                default:
                    throw new Error("Unknown layout command");
            }
        }
    }
}

/** Records one synchronous view traversal. */
class LayoutRecorder extends ViewRenderingContext {
    /** @type {LayoutCommand[]} */
    #commands = [];

    /** @type {View[]} */
    #viewStack = [];

    #sampleFacetBatchDepth = 0;

    /** @type {number} */
    #devicePixelRatio;

    /** @param {number} devicePixelRatio */
    constructor(devicePixelRatio) {
        super({});
        this.#devicePixelRatio = devicePixelRatio;
    }

    /** @override */
    getDevicePixelRatio() {
        return this.#devicePixelRatio;
    }

    /** @override */
    beginSampleFacetBatch() {
        this.#sampleFacetBatchDepth++;
        this.#commands.push({ type: "beginSampleFacetBatch" });
    }

    /** @override */
    endSampleFacetBatch() {
        if (this.#sampleFacetBatchDepth == 0) {
            throw new Error("Unbalanced sample facet batch scope");
        }

        this.#sampleFacetBatchDepth--;
        this.#commands.push({ type: "endSampleFacetBatch" });
    }

    /**
     * @param {View} view
     * @param {import("./rectangle.js").default} coords
     * @override
     */
    pushView(view, coords) {
        this.#viewStack.push(view);
        this.#commands.push({ type: "pushView", view, coords });
    }

    /** @param {View} view @override */
    popView(view) {
        if (this.#viewStack.pop() !== view) {
            throw new Error("Unbalanced view scope");
        }

        this.#commands.push({ type: "popView", view });
    }

    /**
     * @param {Mark} mark
     * @param {RenderingOptions} options
     * @override
     */
    renderMark(mark, options) {
        if (this.#viewStack.length == 0) {
            throw new Error("A mark must be inside a view scope");
        }

        this.#commands.push({
            type: "renderMark",
            mark,
            options: snapshotRenderingOptions(options),
        });
    }

    /** @returns {LayoutResult} */
    complete() {
        if (this.#viewStack.length > 0) {
            throw new Error("Unclosed view scope");
        }
        if (this.#sampleFacetBatchDepth > 0) {
            throw new Error("Unclosed sample facet batch scope");
        }

        return new LayoutResult(this.#commands);
    }
}

/**
 * Isolates mutable pass-specific options while preserving live geometry.
 *
 * @param {RenderingOptions} options
 * @returns {RenderingOptions}
 */
function snapshotRenderingOptions(options) {
    const snapshot = { ...options };
    if (options.sampleFacetRenderingOptions) {
        snapshot.sampleFacetRenderingOptions = {
            ...options.sampleFacetRenderingOptions,
        };
    }
    if (options.clip) {
        snapshot.clip = { ...options.clip };
    }
    return snapshot;
}

/**
 * @typedef {
 *   | { type: "beginSampleFacetBatch" }
 *   | { type: "endSampleFacetBatch" }
 *   | { type: "pushView", view: View, coords: import("./rectangle.js").default }
 *   | { type: "popView", view: View }
 *   | { type: "renderMark", mark: Mark, options: RenderingOptions }
 * } LayoutCommand
 */
