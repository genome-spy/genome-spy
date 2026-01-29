/**
 * @template T
 * @param {T | null | undefined} value
 * @returns {T | undefined}
 */
export default function emptyToUndefined(value) {
    return value ?? undefined;
}
