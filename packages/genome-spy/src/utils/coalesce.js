/**
 *
 * @param {any[]} candidates
 */
export default function coalesce(...candidates) {
    for (const candidate of candidates) {
        if (candidate !== undefined) {
            return candidate;
        }
    }
}
