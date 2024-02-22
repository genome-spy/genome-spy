/**
 * Iterates a nested Map structure created by d3-array's group() function.
 *
 * Yields arrays that contain the compound key and the grouped data items.
 *
 * @param {Map<any, T>} map The root
 * @param {any[]} [path] The path so far.
 * @returns {Generator<[any[], T]>}
 * @template T
 */
export default function* iterateNestedMaps(map, path = []) {
    for (const [key, value] of map.entries()) {
        if (value instanceof Map) {
            for (const m of iterateNestedMaps(value, [...path, key])) {
                yield m;
            }
        } else {
            // TODO: Could recycle compound key arrays for better performance
            yield [[...path, key], value];
        }
    }
}
