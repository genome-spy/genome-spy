/**
 * Uniform layout specification input (before alignment/offsets).
 *
 * @typedef {{ name: string, type: import("../types.js").ScalarType, components: 1|2|4, arrayLength?: number }} UniformSpec
 */

/**
 * Resolved uniform entry with computed offsets/stride.
 *
 * @typedef {{ name: string, type: import("../types.js").ScalarType, components: 1|2|4, offset: number, arrayLength?: number, stride?: number }} UniformEntry
 */

import { buildUniformLayout } from "./uniformLayout.js";

/**
 * Packs uniforms into an ArrayBuffer using the computed layout so marks can
 * write values and upload them in one call.
 *
 * TODO: Provide TWGL.js styled uniform setters for convenience and performance.
 */
export class UniformBuffer {
    /**
     * @param {UniformSpec[]} specs
     */
    constructor(specs) {
        const layout = buildUniformLayout(specs);
        this.entries = layout.entries;
        this.byteLength = layout.byteLength;
        this.data = new ArrayBuffer(this.byteLength);
        this.view = new DataView(this.data);
    }

    /**
     * Write a uniform value by name, enforcing component/array expectations.
     *
     * @param {string} name
     * @param {number|ArrayLike<number>|Array<number|number[]>} value
     */
    setValue(name, value) {
        const entry = this.entries.get(name);
        if (!entry) {
            return;
        }
        if (entry.arrayLength != null) {
            const isArrayLike =
                Array.isArray(value) || ArrayBuffer.isView(value);
            if (!isArrayLike) {
                throw new Error(`Uniform "${name}" expects an array value`);
            }
            const arrayValue = /** @type {ArrayLike<number|number[]>} */ (
                value
            );
            if (arrayValue.length !== entry.arrayLength) {
                throw new Error(
                    `Uniform "${name}" expects ${entry.arrayLength} elements`
                );
            }
            const stride = entry.stride ?? 16;
            for (let i = 0; i < entry.arrayLength; i++) {
                const element = arrayValue[i];
                const baseOffset = entry.offset + i * stride;
                this._writeElement(entry, baseOffset, element);
            }
            return;
        }
        const components = entry.components;
        const isArrayLike = Array.isArray(value) || ArrayBuffer.isView(value);
        if (isArrayLike) {
            const vectorValue = /** @type {ArrayLike<number>} */ (value);
            if (vectorValue.length !== components) {
                throw new Error(
                    `Uniform "${name}" expects ${components} components`
                );
            }
            for (let i = 0; i < components; i++) {
                const component = vectorValue[i];
                if (typeof component !== "number") {
                    throw new Error(
                        `Uniform "${name}" expects ${components} components`
                    );
                }
                this._writeScalar(entry, entry.offset + i * 4, component ?? 0);
            }
        } else {
            if (components !== 1) {
                throw new Error(
                    `Uniform "${name}" expects ${components} components`
                );
            }
            const scalarValue = /** @type {number} */ (value);
            this._writeScalar(entry, entry.offset, scalarValue ?? 0);
            for (let i = 1; i < components; i++) {
                this._writeScalar(entry, entry.offset + i * 4, 0);
            }
        }
    }

    /**
     * @param {UniformEntry} entry
     * @param {number} baseOffset
     * @param {number|number[]} value
     */
    _writeElement(entry, baseOffset, value) {
        if (entry.components === 1) {
            if (typeof value !== "number") {
                throw new Error(
                    `Uniform "${entry.name}" expects scalar elements`
                );
            }
            this._writeScalar(entry, baseOffset, value);
            return;
        }
        if (!Array.isArray(value) || value.length !== entry.components) {
            throw new Error(
                `Uniform "${entry.name}" expects ${entry.components} components`
            );
        }
        for (let i = 0; i < entry.components; i++) {
            this._writeScalar(entry, baseOffset + i * 4, value[i] ?? 0);
        }
    }

    /**
     * @param {UniformEntry} entry
     * @param {number} offset
     * @param {number} value
     */
    _writeScalar(entry, offset, value) {
        if (entry.type === "u32") {
            this.view.setUint32(offset, value >>> 0, true);
        } else if (entry.type === "i32") {
            this.view.setInt32(offset, value | 0, true);
        } else {
            this.view.setFloat32(offset, value ?? 0, true);
        }
    }
}
