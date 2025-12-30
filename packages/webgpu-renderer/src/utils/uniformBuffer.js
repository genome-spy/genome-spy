/**
 * @typedef {{ name: string, type: import("../types.js").ScalarType, components: 1|2|4 }} UniformSpec
 * @typedef {{ type: import("../types.js").ScalarType, components: 1|2|4, offset: number }} UniformEntry
 */

import { buildUniformLayout } from "./uniformLayout.js";

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
     * @param {string} name
     * @param {number|number[]} value
     */
    setValue(name, value) {
        const entry = this.entries.get(name);
        if (!entry) {
            return;
        }
        const components = entry.components;
        if (Array.isArray(value)) {
            if (value.length !== components) {
                throw new Error(
                    `Uniform "${name}" expects ${components} components`
                );
            }
            for (let i = 0; i < components; i++) {
                this._writeScalar(entry, entry.offset + i * 4, value[i] ?? 0);
            }
        } else {
            if (components !== 1) {
                throw new Error(
                    `Uniform "${name}" expects ${components} components`
                );
            }
            this._writeScalar(entry, entry.offset, value ?? 0);
            for (let i = 1; i < components; i++) {
                this._writeScalar(entry, entry.offset + i * 4, 0);
            }
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
