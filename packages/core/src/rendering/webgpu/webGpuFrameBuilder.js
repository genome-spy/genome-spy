import { getViewClipDirections } from "../../view/renderingContext/clipOptions.js";

/** Builds one renderer submission without retaining frame-local state. */
export default class WebGpuFrameBuilder {
    /** @type {import("@genome-spy/webgpu-renderer").RenderItem[]} */
    items = [];

    /** @type {import("@genome-spy/webgpu-renderer").DrawCommand[]} */
    pickingDraws = [];

    /** @type {import("@genome-spy/webgpu-renderer").RenderItem[][]} */
    #stack = [this.items];

    /** @type {{mark: import("../../marks/mark.js").default, parent: import("@genome-spy/webgpu-renderer").RenderItem[], group: {bounds: import("@genome-spy/webgpu-renderer").DrawRect, sampleCount: 4, items: import("@genome-spy/webgpu-renderer").DrawCommand[]}} | undefined} */
    #activeMsaaGroup;

    /** @param {{width: number, height: number, dpr: number}} target */
    constructor(target) {
        this.target = target;
    }

    /**
     * @param {import("../../view/view.js").default} view
     * @param {import("../../view/layout/rectangle.js").default} coords
     * @param {number} opacity
     */
    pushViewGroup(view, coords, opacity) {
        const clip = getViewClipDirections(view);
        const bounds = {
            x: clip.clipX ? coords.x : 0,
            y: clip.clipY ? coords.y : 0,
            width: clip.clipX ? coords.width : this.target.width,
            height: clip.clipY ? coords.height : this.target.height,
        };
        /** @type {import("@genome-spy/webgpu-renderer").RenderItem[]} */
        const items = [];
        this.#currentItems().push({ bounds, opacity, items });
        this.#stack.push(items);
        this.#activeMsaaGroup = undefined;
    }

    popViewGroup() {
        if (this.#stack.length <= 1) {
            throw new Error("Unbalanced WebGPU render group stack.");
        }
        this.#stack.pop();
        this.#activeMsaaGroup = undefined;
    }

    /**
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("@genome-spy/webgpu-renderer").DrawCommand} draw
     * @param {boolean} picking
     * @param {{sampleCount: 1 | 4}} intent
     */
    addDraw(mark, draw, picking, intent) {
        if (picking) {
            this.pickingDraws.push(draw);
            return;
        }
        if (intent.sampleCount !== 4) {
            this.#currentItems().push(draw);
            this.#activeMsaaGroup = undefined;
            return;
        }

        const bounds = {
            ...(draw.scissor ??
                draw.viewport ?? {
                    x: 0,
                    y: 0,
                    width: this.target.width,
                    height: this.target.height,
                }),
        };
        if (bounds.width <= 0 || bounds.height <= 0) {
            this.#activeMsaaGroup = undefined;
            return;
        }
        const parent = this.#currentItems();
        if (
            this.#activeMsaaGroup?.mark === mark &&
            this.#activeMsaaGroup.parent === parent
        ) {
            this.#activeMsaaGroup.group.items.push(draw);
            unionBounds(this.#activeMsaaGroup.group.bounds, bounds);
        } else {
            const group = {
                bounds,
                sampleCount: /** @type {const} */ (4),
                items: [draw],
            };
            parent.push(group);
            this.#activeMsaaGroup = { mark, parent, group };
        }
    }

    finish() {
        if (this.#stack.length !== 1) {
            throw new Error("Cannot render with an open WebGPU render group.");
        }
        return { items: this.items, pickingDraws: this.pickingDraws };
    }

    /** @returns {import("@genome-spy/webgpu-renderer").RenderItem[]} */
    #currentItems() {
        return this.#stack[this.#stack.length - 1];
    }
}

/**
 * @param {import("@genome-spy/webgpu-renderer").DrawRect} target
 * @param {import("@genome-spy/webgpu-renderer").DrawRect} source
 */
function unionBounds(target, source) {
    const x2 = Math.max(target.x + target.width, source.x + source.width);
    const y2 = Math.max(target.y + target.height, source.y + source.height);
    target.x = Math.min(target.x, source.x);
    target.y = Math.min(target.y, source.y);
    target.width = x2 - target.x;
    target.height = y2 - target.y;
}
