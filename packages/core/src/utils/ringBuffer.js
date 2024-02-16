/**
 * @param {number} size
 * @template T
 */
export default function makeRingBuffer(size) {
    /** @type {T[]} */
    const buffer = new Array(size);
    let index = 0;
    let length = 0;

    return {
        push: (/** @type {T} */ value) => {
            buffer[index] = value;
            index = (index + 1) % size;
            length = Math.min(length + 1, size);
        },
        get: () =>
            length < size
                ? buffer.slice(0, length)
                : buffer.slice(index, size).concat(buffer.slice(0, index)),
        length: () => length,
    };
}
