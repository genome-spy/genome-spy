import { html } from "lit";
import formatObject from "../utils/formatObject.js";

/**
 * @type {import("./tooltipHandler.js").TooltipHandler}
 */
export default async function dataTooltipHandler(datum, mark, params) {
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

    /**
     *
     * @param {[string, any][]} entries
     * @param {string} [prefix]
     * @returns {ReturnType<typeof html>[]}
     */
    const entriesToHtml = (entries, prefix) => {
        const strippedEntries = entries.filter(
            ([key, _value]) => !key.startsWith("_")
        );

        if (strippedEntries.length === 0) {
            return;
        }

        return strippedEntries.map(([key, value]) =>
            value !== null && typeof value === "object" && !Array.isArray(value)
                ? html`${entriesToHtml(
                      Object.entries(value),
                      (prefix ? prefix : "") + key + "."
                  )}`
                : html`
                      <tr>
                          <th>${prefix}${key}</th>
                          <td>${formatObject(value)} ${legend(key, datum)}</td>
                      </tr>
                  `
        );
    };

    const tableContents = entriesToHtml(Object.entries(datum));
    if (!tableContents) {
        return;
    }

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
