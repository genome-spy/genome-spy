const zero = "0".charCodeAt(0);

/**
 * Extract numbers from a delimited string. Does not do any error checking.
 *
 * This is roughly 25% faster than using String.split and parseInt (on Chrome).
 *
 * @param {string} string
 */
export default function* numberExtractor(string, delimiter = ",") {
    const delCode = delimiter.charCodeAt(0);

    let acc = 0;
    for (let i = 0; i < string.length; i++) {
        const charCode = string.charCodeAt(i);
        if (charCode == delCode) {
            yield acc;
            acc = 0;
        } else {
            acc = acc * 10 + charCode - zero;
        }
    }
    yield acc;
}
