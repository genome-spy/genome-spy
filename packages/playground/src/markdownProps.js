/**
 * Adds markdownDescription props to a schema. See https://github.com/Microsoft/monaco-editor/issues/885
 *
 * Copypasted from: https://github.com/vega/editor/blob/master/src/utils/markdownProps.ts
 *
 * @param {any} value
 */
export default function addMarkdownProps(value) {
    if (typeof value === "object" && value !== null) {
        if (value.description) {
            value.markdownDescription = value.description;
        }

        for (const key in value) {
            // eslint-disable-next-line no-prototype-builtins
            if (value.hasOwnProperty(key)) {
                value[key] = addMarkdownProps(value[key]);
            }
        }
    }
    return value;
}
