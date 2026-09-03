/**
 * Tracks effective state within one render pass and suppresses redundant
 * encoder calls. A new instance must be created for every pass.
 */
export default class RenderPassState {
    /** @param {GPURenderPassEncoder} pass */
    constructor(pass) {
        this.pass = pass;
        /** @type {GPURenderPipeline | null} */
        this.pipeline = null;
        /** @type {(GPUBindGroup | undefined)[]} */
        this.bindGroups = [];
        /** @type {(readonly number[] | undefined)[]} */
        this.dynamicOffsets = [];
        this.viewport = [NaN, NaN, NaN, NaN, NaN, NaN];
        this.scissor = [NaN, NaN, NaN, NaN];
    }

    /** @param {GPURenderPipeline} pipeline */
    setPipeline(pipeline) {
        if (pipeline === this.pipeline) {
            return;
        }
        this.pass.setPipeline(pipeline);
        this.pipeline = pipeline;
    }

    /**
     * @param {number} index
     * @param {GPUBindGroup} bindGroup
     * @param {readonly number[]} [dynamicOffsets]
     */
    setBindGroup(index, bindGroup, dynamicOffsets) {
        const previous = this.bindGroups[index];
        if (
            previous === bindGroup &&
            offsetsEqual(this.dynamicOffsets[index], dynamicOffsets)
        ) {
            return;
        }
        if (dynamicOffsets) {
            this.pass.setBindGroup(index, bindGroup, dynamicOffsets);
        } else {
            this.pass.setBindGroup(index, bindGroup);
        }
        this.bindGroups[index] = bindGroup;
        this.dynamicOffsets[index] = dynamicOffsets;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @param {number} minDepth
     * @param {number} maxDepth
     */
    setViewport(x, y, width, height, minDepth, maxDepth) {
        const values = this.viewport;
        if (
            values[0] === x &&
            values[1] === y &&
            values[2] === width &&
            values[3] === height &&
            values[4] === minDepth &&
            values[5] === maxDepth
        ) {
            return;
        }
        this.pass.setViewport(x, y, width, height, minDepth, maxDepth);
        values[0] = x;
        values[1] = y;
        values[2] = width;
        values[3] = height;
        values[4] = minDepth;
        values[5] = maxDepth;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    setScissorRect(x, y, width, height) {
        const values = this.scissor;
        if (
            values[0] === x &&
            values[1] === y &&
            values[2] === width &&
            values[3] === height
        ) {
            return;
        }
        this.pass.setScissorRect(x, y, width, height);
        values[0] = x;
        values[1] = y;
        values[2] = width;
        values[3] = height;
    }
}

/**
 * Identity is checked by the caller before comparing the usually empty or
 * single-element dynamic-offset arrays.
 *
 * @param {readonly number[] | undefined} a
 * @param {readonly number[] | undefined} b
 */
function offsetsEqual(a, b) {
    if (a === b) {
        return true;
    } else if (!a || !b || a.length !== b.length) {
        return false;
    }
    for (let index = 0; index < a.length; index++) {
        if (a[index] !== b[index]) {
            return false;
        }
    }
    return true;
}
