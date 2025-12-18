/**
 * @param {string} s
 * @returns {string}
 */
function _escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Escape occurrences of `separator` by prefixing with a backslash.
 *
 * @param {string} s
 * @param {string} [separator]
 * @returns {string}
 */
export function escapeSeparator(s, separator = "/") {
    const escSep = _escapeRegex(separator);
    return s.replace(new RegExp(escSep, "g"), "\\" + separator);
}

/**
 * Unescape occurrences of `separator` previously escaped with a backslash.
 *
 * @param {string} s
 * @param {string} [separator='/']
 * @returns {string}
 */
export function unescapeSeparator(s, separator = "/") {
    const escSep = _escapeRegex(separator);
    return s.replace(new RegExp("\\\\" + escSep, "g"), separator);
}

/**
 * Join an array of path parts into a single string, escaping slashes inside parts.
 * Example: ["a","b/c","d"] -> "a/b\/c/d"
 *
 * @param {string[]} parts
 * @returns {string}
 */
export function joinPathParts(parts, separator = "/") {
    return parts.map((p) => escapeSeparator(p, separator)).join(separator);
}

/**
 * Split a joined path string into parts, respecting escaped slashes.
 * Example: "a/b\/c/d" -> ["a","b/c","d"]
 *
 * @param {string} s
 * @param {string} [separator='/']
 * @returns {string[]}
 */
export function splitPath(s, separator = "/") {
    const sep = separator;
    const parts = [];
    let cur = "";
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === "\\") {
            const next = s.substring(i + 1, i + 1 + sep.length);
            if (next === sep) {
                cur += sep;
                i += sep.length; // skip the separator
                continue;
            }
            // keep backslash if not escaping separator
            cur += "\\";
        } else if (s.substring(i, i + sep.length) === sep) {
            parts.push(cur);
            cur = "";
            i += sep.length - 1; // -1 because the loop will increment i
        } else {
            cur += ch;
        }
    }
    parts.push(cur);
    return parts;
}
