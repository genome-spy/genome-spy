/**
 * @param  {...Iterable<T>} iterables
 * @template T
 */
export default function concatIterables(...iterables) {
    if (iterables.length <= 0) {
        return {
            *[Symbol.iterator]() {
                //
            },
        };
    }

    let currentIterable = iterables.shift();

    return {
        *[Symbol.iterator]() {
            do {
                for (const value of currentIterable) {
                    yield value;
                }
                currentIterable = iterables.shift();
            } while (currentIterable);
        },
    };
}
