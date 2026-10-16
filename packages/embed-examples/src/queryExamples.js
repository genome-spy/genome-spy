import { html, render } from "lit";

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

/**
 * Exposes public track/source metadata as readable information and exact values.
 * @param {import("@genome-spy/core/view-query").ViewQueryApi} query
 * @param {import("@genome-spy/core/types/embedApi.js").ViewHandle} track
 * @param {HTMLElement} container
 */
export function renderTrackInfo(query, track, container) {
    const view = query.describe(track);
    const source = query.describeSource(track);
    const coverage = source?.coverage;
    const encoding = Object.entries(view.encoding).map(
        ([channel, definition]) => {
            const field = "field" in definition ? definition.field : "constant";
            return channel + " ← " + field;
        }
    );

    render(
        html`
            <h2>About this track</h2>
            <p>${view.title}</p>
            <p>${view.description}</p>
            <dl class="track-info">
                <dt>Fields</dt>
                <dd>${encoding.join("; ")}</dd>
                <dt>Track data</dt>
                <dd>
                    ${view.dataReady ? "Ready" : "Pending"} · revision
                    ${formatValue(view.dataRevision)}
                </dd>
                <dt>Display configuration</dt>
                <dd>
                    ${view.visibility.configured ? "Shown" : "Hidden"};
                    hierarchy
                    ${view.visibility.ancestorsVisible ? "shown" : "hidden"};
                    opacity ${formatValue(view.visibility.opacity)}
                </dd>
                <dt>Source</dt>
                <dd>
                    ${source ? html`${source.ready ? "Ready" : "Pending"}; retention ${source.retentionEnabled ? "enabled" : "disabled"}; loading report: ${source.loadingStatus ?? "unavailable"}` : "No primary source"}
                </dd>
                <dt>Source coverage</dt>
                <dd>
                    ${coverage?.type === "complete-source" ? "Complete declared toy source loaded" : coverage?.type === "published-domain" ? "Published bounds: " + coverage.domain.join("–") : "Unknown"}
                </dd>
            </dl>
            <p class="hint">
                Display configuration does not establish which rows produced
                visible pixels.
            </p>
            <details>
                <summary>Track and source API responses</summary>
                <p>
                    <code>query.describe(track)</code> describes the view;
                    <code>query.describeSource(track)</code> describes its
                    primary source.
                </p>
                <pre>${JSON.stringify({ view, source }, null, 2)}</pre>
            </details>
        `,
        container
    );
}
