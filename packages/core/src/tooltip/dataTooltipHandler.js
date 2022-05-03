import { html } from "lit-html";
import formatObject from "../utils/formatObject";

/**
 * @type {import("./tooltipHandler").TooltipHandler}
 */
export default async function dataTooltipHandler(datum, mark, params) {
    /**
     * @param {string} key
     * @param {object} datum
     */
    const legend = (key, datum) => {
        for (const [channel, encoder] of Object.entries(mark.encoders)) {
            if (encoder?.accessor?.fields.includes(key)) {
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

    const table = html`
        <table class="attributes">
            ${Object.entries(datum)
                .filter(([key, value]) => !key.startsWith("_"))
                .map(
                    ([key, value]) => html`
                        <tr>
                            <th>${key}</th>
                            <td>
                                ${formatObject(value)} ${legend(key, datum)}
                            </td>
                        </tr>
                    `
                )}
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
