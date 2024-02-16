/**
 * @template T
 */
export default class RingBuffer {
    /** @type {T[]} */
    #buffer;

    #index = 0;

    #length = 0;

    /**
     * @param {number} size
     */
    constructor(size) {
        this.#buffer = new Array(size);
    }

    /** @param {T} value */
    push(value) {
        this.#buffer[this.#index] = value;
        this.#index = (this.#index + 1) % this.size;
        this.#length = Math.min(this.#length + 1, this.size);
    }

    /**
     * @returns {T[]}
     */
    get() {
        const b = this.#buffer;
        return this.#length < this.size
            ? b.slice(0, this.#length)
            : b.slice(this.#index, this.size).concat(b.slice(0, this.#index));
    }

    get size() {
        return this.#buffer.length;
    }

    get length() {
        return this.#length;
    }
}
