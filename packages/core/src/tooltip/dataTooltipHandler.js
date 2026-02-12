import { html } from "lit";
import formatObject from "../utils/formatObject.js";
import { flattenDatumRows } from "./flattenDatumRows.js";
import createTooltipContext from "./tooltipContext.js";

/**
 * @type {import("./tooltipHandler.js").TooltipHandler}
 */
export default async function dataTooltipHandler(datum, mark, params, context) {
    /**
     * @param {string} key
     * @param {object} datum
     */
    const legend = (key, datum) => {
        for (const [channel, encoder] of Object.entries(mark.encoders)) {
            if (encoder?.dataAccessor?.fields.includes(key)) {
                switch (channel) {
                    case "color":
                    case "fill":
                    case "stroke":
                        return html`
                            <span
                                class="color-legend"
                                style=${`background-color: ${encoder(datum)}`}
                            ></span>
                        `;
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
        const valueLegend = legend(row.key, datum);
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
