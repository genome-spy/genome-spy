import { isNumber, isString, isBoolean, isArray } from "vega-util";
import { format as d3format } from "d3-format";
import { html, nothing } from "lit-html";

const numberFormat = d3format(".4~r");
const exponentNumberFormat = d3format(".4~e");

/**
 *
 * @param {any} object Object to format
 * @returns {string | import("lit-html").TemplateResult}
 */
export default function formatObject(object) {
    if (object === null || object === undefined) {
        return html` <span class="na">NA</span> `;
    }

    if (isString(object)) {
        return object.substring(0, 30);
    } else if (Number.isInteger(object)) {
        return "" + object;
    } else if (isNumber(object)) {
        return Math.abs(object) > Math.pow(10, 8) ||
            Math.abs(object) < Math.pow(10, -8)
            ? exponentNumberFormat(object)
            : numberFormat(object);
    } else if (isBoolean(object)) {
        return object ? "True" : "False";
    } else if (isArray(object)) {
        return html`${object.map((param, i) => [
            formatObject(param),
            i < object.length - 1 ? ", " : nothing,
        ])}`;
    } else {
        return "?" + typeof object + " " + object;
    }
}
