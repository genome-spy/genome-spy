/* https://stackoverflow.com/a/41699140/1547896 */

export function escapeHtml(str) {
    var map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
    };
    return str.replace(/[&<>"']/g, (m) => map[m]);
}

export function decodeHtml(str) {
    var map = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#039;": "'",
    };
    return str.replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, (m) => map[m]);
}
