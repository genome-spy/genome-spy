import { html } from "lit";
import { splitAccessPath } from "vega-util";
import formatObject from "../utils/formatObject.js";
import { flattenDatumRows } from "./flattenDatumRows.js";
import createTooltipContext from "./tooltipContext.js";

/**
 * @type {import("./tooltipHandler.js").TooltipHandler}
 */
export default async function dataTooltipHandler(datum, mark, params, context) {
    /**
     * @param {string} fieldPath
     * @returns {string}
     */
    // Tooltip rows are flattened using dot notation. Normalize encoded field
    // access paths (for example bracket syntax) to the same shape.
    const normalizeFieldPath = (fieldPath) =>
        splitAccessPath(fieldPath).join(".");

    /**
     * @param {unknown} value
     * @returns {boolean}
     */
    // Treat NaN like missing in tooltip semantics to avoid showing an
    // "unmapped" marker for invalid numeric values.
    const hasValue = (value) =>
        value !== null &&
        value !== undefined &&
        !(typeof value === "number" && Number.isNaN(value));

    /**
     * @param {string} key
     * @param {any} value
     * @param {object} datum
     */
    const legend = (key, value, datum) => {
        for (const [channel, encoder] of Object.entries(mark.encoders)) {
            const fields = encoder?.dataAccessor?.fields;
            if (
                fields &&
                fields.some(
                    (fieldPath) =>
                        fieldPath === key ||
                        normalizeFieldPath(fieldPath) === key
                )
            ) {
                switch (channel) {
                    case "color":
                    case "fill":
                    case "stroke": {
                        const encodedColor = encoder(datum);
                        if (
                            encodedColor !== null &&
                            encodedColor !== undefined
                        ) {
                            return html`
                                <span
                                    class="color-legend"
                                    style=${"background-color: " +
                                    String(encodedColor)}
                                ></span>
                            `;
                        } else if (hasValue(value)) {
                            // The field has a value but the scale did not map it
                            // (typically outside/absent domain): show an empty,
                            // black-stroked swatch to signal the mismatch.
                            return html`
                                <span
                                    class="color-legend color-legend-unmapped"
                                ></span>
                            `;
                        } else {
                            return "";
                        }
                    }
                    default:
                }
            }
        }

        return "";
    };

    const tooltipContext = context ?? createTooltipContext(datum, mark, params);
    const rawRows = tooltipContext.flattenDatumRows
        ? tooltipContext.flattenDatumRows()
        : flattenDatumRows(datum);
    const genomicRows = tooltipContext.genomicRows ?? [];
    const hiddenRowKeys = new Set(tooltipContext.hiddenRowKeys ?? []);

    const visibleRawRows = rawRows.filter((row) => !hiddenRowKeys.has(row.key));
    const orderedRows = [...genomicRows, ...visibleRawRows];
    if (!orderedRows.length) {
        return;
    }

    const tableContents = orderedRows.map((row) => {
        const value = formatObject(row.value);
        const valueLegend = legend(row.key, row.value, datum);
        return html`
            <tr>
                <th>${row.key}</th>
                <td>${value} ${valueLegend}</td>
            </tr>
        `;
    });

    const table = html`
        <table class="attributes">
            ${tableContents}
        </table>
    `;

    const titleText = mark.unitView.getTitleText();
    const title = titleText
        ? html`
              <div class="title">
                  <strong>${titleText}</strong>
              </div>
          `
        : "";

    return html`${title}${table}`;
}
