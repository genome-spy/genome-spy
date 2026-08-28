/**
 * Converts picking IDs into stable opaque diagnostic colors.
 * The colors are never decoded back into IDs.
 *
 * @param {Uint32Array} ids
 * @param {Uint8ClampedArray} [target]
 * @returns {Uint8ClampedArray}
 */
export function colorizePickingIds(
    ids,
    target = new Uint8ClampedArray(ids.length * 4)
) {
    if (target.length != ids.length * 4) {
        throw new RangeError(
            "Picking diagnostic color storage has an incompatible length."
        );
    }

    for (let i = 0; i < ids.length; i++) {
        const offset = i * 4;
        const id = ids[i];
        if (id == 0) {
            target[offset] = 0;
            target[offset + 1] = 0;
            target[offset + 2] = 0;
        } else {
            const hash = mixId(id);
            target[offset] = 64 + (hash & 127);
            target[offset + 1] = 64 + ((hash >>> 8) & 127);
            target[offset + 2] = 64 + ((hash >>> 16) & 127);
        }
        target[offset + 3] = 255;
    }
    return target;
}

/** @param {number} id @returns {number} */
function mixId(id) {
    let hash = id >>> 0;
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d);
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x846ca68b);
    return (hash ^ (hash >>> 16)) >>> 0;
}
