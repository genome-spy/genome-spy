import { LitElement, html, css, nothing } from "lit";

/**
 * Preview an array of records with a sticky header and virtualized rows.
 * Give the grid a bounded height so it can size its scrollable viewport.
 *
 * @tag gs-data-grid
 * @csspart grid - Outer grid frame.
 * @csspart body - Scrollable viewport for the rows.
 * @cssprop --gs-control-background - Grid surface.
 * @cssprop --gs-control-text - Grid text color.
 * @cssprop --gs-control-border - Frame border.
 * @cssprop --gs-control-radius - Frame corner radius.
 * @cssprop --gs-divider-color - Header and row separators.
 */
export default class DataGrid extends LitElement {
    /**
     * @typedef {object} ColumnMeta
     * @prop {string} key
     * @prop {string} label
     * @prop {number} [width] in pixels
     * @prop {boolean} [isNumeric]
     */

    /**
     * @typedef {Record<string, any>} Item
     */

    /** */
    static properties = {
        items: { type: Array },
        label: { type: String, attribute: "aria-label" },
        rowHeight: { type: Number },
        buffer: { type: Number },
        blockMultiplier: { type: Number },
    };

    /** @type {number} */
    #startIndex = 0;

    /** @type {number} */
    #visibleCount = 0;

    /** @type {ColumnMeta[]} */
    #cols = null;

    /** @type {HTMLElement} */
    #body = null;

    /** @type {CanvasRenderingContext2D} */
    #ctx = null;

    #resizeObserver = new ResizeObserver(() => this.#recomputeVisible());

    constructor() {
        super();
        /** @type {Item[]} Records to preview. The grid derives columns from the data. */
        this.items = [];
        /** Accessible name of the keyboard-scrollable preview. */
        this.label = "Data preview";
        /** Fixed row height in pixels. */
        this.rowHeight = 32;
        /** Extra rows to render above and below the visible range. */
        this.buffer = 5;
        /** Virtualization block height as a multiple of the viewport height. */
        this.blockMultiplier = 3;
    }

    static styles = css`
        :host {
            display: block;
            position: relative;

            font-size: inherit;
            font-family: inherit;

            --dg-border: var(
                --gs-control-border,
                var(--form-control-border-color, #ccc)
            );
        }

        .grid-root {
            background-color: var(--gs-control-background, transparent);
            color: var(--gs-control-text, inherit);
            border: 1px solid var(--dg-border);
            border-radius: var(
                --gs-control-radius,
                var(--form-control-border-radius, 4px)
            );
            display: flex;
            overflow: hidden;
            position: absolute;
            inset: 0;
        }

        .grid-body {
            flex: 1;
            min-width: 0;
            overflow: auto;
        }

        .grid-body:focus-visible {
            outline: 2px solid var(--gs-focus-color, #2563a6);
            outline-offset: -2px;
        }

        table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            table-layout: fixed;
        }

        th {
            position: sticky;
            top: 0;
            z-index: 1;
            background-color: var(--gs-control-background, Canvas);
            text-align: left;
            height: var(--_row-height);
            border-bottom: 1px solid var(--gs-divider-color, var(--dg-border));
            font-weight: 600;
        }

        tbody tr:not(.spacer) {
            height: var(--_row-height);
        }

        td.cell {
            border-bottom: 1px solid
                var(--gs-divider-color, rgba(0, 0, 0, 0.03));
        }

        .spacer td {
            padding: 0;
            border: 0;
        }

        .cell.numeric {
            text-align: right;
            font-variant-numeric: tabular-nums;
        }

        .cell {
            padding: 0 0.5rem;
            box-sizing: border-box;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `;

    connectedCallback() {
        super.connectedCallback();
        this.#resizeObserver.observe(this);
    }

    disconnectedCallback() {
        this.#resizeObserver.disconnect();
        super.disconnectedCallback();
    }

    firstUpdated() {
        this.#body = this.renderRoot.querySelector(".grid-body");

        this.#recomputeVisible();
    }

    /**
     * @param {string} text
     * @returns {number}
     */
    #measureText(text) {
        if (text == null) return 0;
        if (!this.#ctx) {
            const canvas = document.createElement("canvas");
            this.#ctx = canvas.getContext("2d");
        }
        const style = getComputedStyle(this);
        const fontSize = style.fontSize ?? "14px";
        const fontFamily = style.fontFamily ?? "sans-serif";
        const fontWeight = style.fontWeight ?? "400";
        this.#ctx.font = `${fontWeight} ${fontSize} ${fontFamily}`;
        try {
            const metrics = this.#ctx.measureText(String(text));
            return metrics.width ?? 0;
        } catch {
            return String(text).length * (parseFloat(fontSize) ?? 14) * 0.6;
        }
    }

    #computeColumnWidths() {
        const items = this.items ?? /** @type {Item[]} */ ([]);
        const keys = items.length ? Object.keys(items[0]) : [];

        const style = getComputedStyle(this);
        const fontSize = parseFloat(style.fontSize) || 14;
        const minPx = 3 * fontSize; // 3em TODO: Configurable
        const maxPx = 20 * fontSize; // 20em TODO: Configurable

        const sampleCount = Math.min(100, items.length);
        const widths = keys.map((col) => {
            let maxW = this.#measureText(col ?? "");
            for (let i = 0; i < sampleCount; i++) {
                const v = items[i] ? items[i][col] : "";
                const w = this.#measureText(v == null ? "" : String(v));
                if (w > maxW) maxW = w;
            }
            const padding = 24; // px TODO: Configurable
            const wpx = Math.ceil(
                Math.min(maxPx, Math.max(minPx, maxW + padding))
            );
            return wpx;
        });

        // detect numeric columns heuristically from sample values
        const isNumeric = keys.map((col) => {
            let numericCount = 0;
            let nonNullCount = 0;
            for (let i = 0; i < sampleCount; i++) {
                const v = items[i] ? items[i][col] : null;
                if (v === null || v === undefined || v === "") continue;
                nonNullCount++;
                if (typeof v === "number") numericCount++;
                else if (typeof v === "string") {
                    const s = v.trim();
                    if (s === "") continue;
                    const num = Number(s.replace(/[, ]+/g, ""));
                    if (isFinite(num)) numericCount++;
                }
            }
            return nonNullCount === 0
                ? false
                : numericCount / nonNullCount >= 0.8;
        });

        const cols = keys.map((explicit, i) => {
            return {
                key: explicit,
                label: explicit,
                width: widths[i],
                isNumeric: isNumeric[i],
            };
        });

        this.#cols = cols;
    }

    #recomputeVisible() {
        if (!this.#body) return;
        const rowH = this.rowHeight;
        const total = this.items?.length ?? 0;
        // The sticky header occupies the first row of the viewport.
        const viewportRows = Math.max(
            1,
            Math.ceil((this.#body.clientHeight - rowH) / rowH)
        );
        const firstVisible = Math.min(
            Math.floor(this.#body.scrollTop / rowH),
            Math.max(0, total - viewportRows)
        );

        const multiplier = this.blockMultiplier ?? 1;
        const blockSize = Math.max(1, Math.ceil(viewportRows * multiplier));
        const startBlock = Math.floor(firstVisible / blockSize) * blockSize;

        const buffer = this.buffer ?? 0;
        const start = Math.max(0, startBlock - buffer);
        const end =
            Math.max(startBlock + blockSize, firstVisible + viewportRows) +
            buffer;
        const visible = Math.max(0, Math.min(total, end) - start);

        const changed =
            this.#startIndex !== start || this.#visibleCount !== visible;
        this.#startIndex = start;
        this.#visibleCount = visible;
        if (changed) this.requestUpdate();
    }

    /**
     *
     * @param {Map<string, any>} changedProps
     */
    willUpdate(changedProps) {
        if (changedProps.has("items")) {
            this.#computeColumnWidths();
        }

        if (
            changedProps.has("items") ||
            changedProps.has("rowHeight") ||
            changedProps.has("buffer") ||
            changedProps.has("blockMultiplier")
        ) {
            this.#recomputeVisible();
        }
    }

    /**
     *
     * @param {ColumnMeta[]} columnsMeta
     * @returns
     */
    #renderHeader(columnsMeta) {
        return html`${columnsMeta.map(
            (c) =>
                html`<th
                    scope="col"
                    class="cell ${c.isNumeric ? "numeric" : ""}"
                >
                    ${c.label}
                </th>`
        )}`;
    }

    /**
     * @param {Item} item
     * @param {ColumnMeta[]} columnsMeta
     */
    #renderRow(item, columnsMeta) {
        return html`${columnsMeta.map(
            (c) =>
                html`<td class="cell ${c.isNumeric ? "numeric" : ""}">
                    ${this.#formatCell(item[c.key])}
                </td>`
        )}`;
    }

    /**
     * @param {any} value
     */
    #formatCell(value) {
        if (value === null || value === undefined) return html``;
        if (typeof value === "object") return html`${JSON.stringify(value)}`;
        return html`${String(value)}`;
    }

    /** @returns {import("lit").HTMLTemplateResult} */
    render() {
        const items = this.items ?? /** @type {Item[]} */ ([]);
        const columns = items.length ? Object.keys(items[0]) : [];

        const totalHeight = items.length * this.rowHeight;
        const start = this.#startIndex ?? 0;
        const slice = items.slice(start, start + this.#visibleCount);

        const colsMeta =
            this.#cols ||
            columns.map((k) => ({
                key: k,
                label: k,
                width: /** @type {number} */ (null),
                isNumeric: false,
            }));

        const colgroup = html`<colgroup>
            ${colsMeta.map((c) =>
                c.width
                    ? html`<col style="width:${c.width}px" />`
                    : html`<col />`
            )}
        </colgroup>`;

        const topSpacer = start * this.rowHeight;
        const renderedHeight = slice.length * this.rowHeight;
        const bottomSpacer = Math.max(
            0,
            totalHeight - topSpacer - renderedHeight
        );

        const totalTableWidth =
            (this.#cols &&
                this.#cols.reduce((s, c) => s + (c.width ?? 0), 0)) ||
            null;

        return html`
            <div class="grid-root" part="grid">
                <div
                    class="grid-body"
                    part="body"
                    role="region"
                    aria-label=${this.label || "Data preview"}
                    tabindex="0"
                    @scroll=${this.#recomputeVisible}
                >
                    <table
                        aria-rowcount=${items.length + 1}
                        style="--_row-height:${this.rowHeight}px;min-width:${
                            totalTableWidth ? totalTableWidth + "px" : "100%"
                        }"
                    >
                        ${colgroup}
                        <thead>
                            <tr aria-rowindex="1">
                                ${this.#renderHeader(colsMeta)}
                            </tr>
                        </thead>
                        <tbody>
                            ${this.#renderSpacer(topSpacer, colsMeta.length)}
                            ${slice.map(
                                (item, i) =>
                                    html`<tr aria-rowindex=${start + i + 2}>
                                        ${this.#renderRow(item, colsMeta)}
                                    </tr>`
                            )}
                            ${this.#renderSpacer(bottomSpacer, colsMeta.length)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    /**
     * @param {number} height
     * @param {number} columns
     */
    #renderSpacer(height, columns) {
        return height > 0
            ? html`<tr
                  class="spacer"
                  aria-hidden="true"
                  style="height:${height}px"
              >
                  <td colspan=${columns}></td>
              </tr>`
            : nothing;
    }
}
