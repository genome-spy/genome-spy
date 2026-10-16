import { html } from "lit";

/** @param {unknown} value @returns {string} */
export function formatValue(value) {
    if (value === null || value === undefined) return "—";
    return typeof value === "number"
        ? value.toLocaleString("en-US", { maximumFractionDigits: 3 })
        : String(value);
}

/**
 * Formats returned rows; it does not filter or analyze the original dataset.
 * @param {[string, string][]} columns Field name and column heading pairs.
 * @param {ReadonlyArray<Readonly<Record<string, unknown>>>} rows
 */
export function dataTable(columns, rows) {
    return html`<table>
        <thead>
            <tr>
                ${columns.map(([, label]) => html`<th scope="col">${label}</th>`)}
            </tr>
        </thead>
        <tbody>
            ${rows.map(
                (row) =>
                    html`<tr>
                        ${columns.map(([field]) => html`<td>${formatValue(row[field])}</td>`)}
                    </tr>`
            )}
        </tbody>
    </table>`;
}
