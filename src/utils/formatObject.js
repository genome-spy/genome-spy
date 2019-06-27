import { isNumber, isString, isBoolean } from 'vega-util';
import { format as d3format } from 'd3-format';

const numberFormat = d3format(".4~r");

export default function formatObject(object) {
    if (object === null) {
        return "";
    }

    if (isString(object)) {
        return object.substring(0, 30);

    } else if (Number.isInteger(object)) {
        return "" + object;

    } else if (isNumber(object)) {
        return numberFormat(object);

    } else if (isBoolean(object)) {
        return object ? "True" : "False";

    } else {
        return "?" + (typeof object) + " " + object;
    }
}