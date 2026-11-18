import { buildUniformLayout } from "./uniformLayout.js";

/** @typedef {import("./uniformLayout.js").UniformSpec} UniformSpec */
/** @typedef {import("./uniformLayout.js").UniformEntry} UniformEntry */
/** @typedef {number | ArrayLike<number> | Array<number | number[]>} UniformValue */
/** @typedef {(value: UniformValue) => void} UniformSetter */

/** Packs uniforms using writers compiled from the fixed layout. */
export class UniformBuffer {
    /** @type {Map<string, UniformSetter>} */
    #setters;

    /** @param {UniformSpec[]} specs */
    constructor(specs) {
        const layout = buildUniformLayout(specs);
        this.entries = layout.entries;
        this.byteLength = layout.byteLength;
        this.data = new ArrayBuffer(this.byteLength);
        this.#setters = new Map(
            this.entries
                .values()
                .map((entry) => [
                    entry.name,
                    compileUniformSetter(this.data, entry),
                ])
        );
    }

    /**
     * Return a retained writer. Optional uniforms absent from the layout are
     * ignored, matching writes through setValue.
     * @param {string} name
     * @returns {UniformSetter}
     */
    getSetter(name) {
        return this.#setters.get(name) ?? ignoreUniform;
    }

    /**
     * @param {string} name
     * @param {UniformValue} value
     */
    setValue(name, value) {
        this.#setters.get(name)?.(value);
    }
}

/** @type {UniformSetter} */
const ignoreUniform = () => {};

/**
 * @param {ArrayBuffer} buffer
 * @param {UniformEntry} entry
 * @returns {UniformSetter}
 */
function compileUniformSetter(buffer, entry) {
    const { name, offset, components, arrayLength } = entry;
    const ArrayType =
        entry.type === "u32"
            ? Uint32Array
            : entry.type === "i32"
              ? Int32Array
              : Float32Array;
    const data = new ArrayType(buffer, offset);

    if (arrayLength === undefined && components === 1) {
        return (value) => {
            if (Array.isArray(value) || ArrayBuffer.isView(value)) {
                const values = /** @type {ArrayLike<number>} */ (value);
                if (values.length !== 1 || typeof values[0] !== "number") {
                    throw new Error(`Uniform "${name}" expects 1 components`);
                }
                data[0] = values[0];
            } else {
                data[0] = /** @type {number} */ (value) ?? 0;
            }
        };
    }

    if (arrayLength === undefined || components === 1) {
        const length = arrayLength ?? components;
        const stride = arrayLength === undefined ? 1 : (entry.stride ?? 16) / 4;
        const error =
            arrayLength === undefined
                ? `Uniform "${name}" expects ${components} components`
                : `Uniform "${name}" expects ${arrayLength} elements`;
        return (value) => {
            if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
                throw new Error(error);
            }
            const values = /** @type {ArrayLike<number>} */ (value);
            if (values.length !== length) throw new Error(error);
            for (let i = 0; i < length; i++) {
                if (typeof values[i] !== "number") throw new Error(error);
                data[i * stride] = values[i];
            }
        };
    }

    const stride = (entry.stride ?? 16) / 4;
    return (value) => {
        if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
            throw new Error(`Uniform "${name}" expects an array value`);
        }
        const values = /** @type {ArrayLike<number | number[]>} */ (value);
        if (values.length !== arrayLength) {
            throw new Error(
                `Uniform "${name}" expects ${arrayLength} elements`
            );
        }
        for (let i = 0; i < arrayLength; i++) {
            const element = values[i];
            if (!Array.isArray(element) || element.length !== components) {
                throw new Error(
                    `Uniform "${name}" expects ${components} components`
                );
            }
            for (let j = 0; j < components; j++) {
                data[i * stride + j] = element[j] ?? 0;
            }
        }
    };
}
