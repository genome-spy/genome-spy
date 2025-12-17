import { LitElement, html, css } from "lit";
import SubscriptionController from "./subscriptionController.js";

/**
 * gs-data-grid
 *
 * Simple, high-performance data grid for viewing arrays of plain objects.
 * - Input: `items` (Array<Object>)
 * - Sticky header
 * - Virtualized rows with fixed `rowHeight`
 *
 * Usage:
 * <gs-data-grid .items=${data} style="height:400px"></gs-data-grid>
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
        rowHeight: { type: Number }, // TODO: Make configurable. Now broken.
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

    #subs = new SubscriptionController(this);

    constructor() {
        super();
        /** @type {Item[]} */
        this.items = [];
        this.rowHeight = 32; // px
        this.buffer = 5; // extra rows rendered above/below
        this.blockMultiplier = 3; // render blocks that are `blockMultiplier * viewport` tall
    }

    static styles = css`
        :host {
            display: block;
            /* inherit font properties from light DOM host */
            font-size: inherit;
            font-family: inherit;
            /* fallback family for compatibility */
            font-family: var(
                --gs-font-family,
                system-ui,
                -apple-system,
                "Segoe UI",
                Roboto,
                "Helvetica Neue",
                Arial
            );
            --dg-row-height: 32px;
            --dg-border: var(--form-control-border-color, #ccc);
        }

        .grid-root {
            border: 1px solid var(--dg-border);
            border-radius: var(--form-control-border-radius, 4px);
            overflow: hidden;
            height: 100%;
        }

        .header-table,
        .body-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }

        .header-table th {
            text-align: left;
            padding: 0 0.5rem;
            height: var(--dg-row-height);
            box-sizing: border-box;
            border-bottom: 1px solid var(--dg-border);
            font-weight: 600;
        }

        .grid-body {
            overflow: auto;
            height: 300px;
            position: relative;
            contain: content;
            -webkit-overflow-scrolling: touch;
        }

        .body-table tr {
            height: var(--dg-row-height);
        }

        .body-table td {
            padding: 0 0.5rem;
            box-sizing: border-box;
            border-bottom: 1px solid rgba(0, 0, 0, 0.03);
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }

        .body-table td.numeric,
        .header-table th.numeric {
            text-align: right;
            font-variant-numeric: tabular-nums;
        }

        .cell {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `;

    firstUpdated() {
        this.#body = this.renderRoot.querySelector(".grid-body");

        this.#body.addEventListener("scroll", () => this.#onScroll(), {
            passive: true,
        });
        this.#recomputeVisible();

        this.#subs.addUnsubscribeCallback(() => {
            this.#body.removeEventListener("scroll", this.#onScroll);
        });

        const resizeObserver = new ResizeObserver(() =>
            this.#recomputeVisible()
        );
        resizeObserver.observe(this);
        this.#subs.addUnsubscribeCallback(() => {
            resizeObserver.disconnect();
        });
    }

    #onScroll() {
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
        } catch (e) {
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
        const items = this.items;
        const total = items.length;
        const vh = this.#body.clientHeight ?? 0;
        const viewportRows = Math.max(1, Math.ceil(vh / rowH));
        const scrollTop = this.#body.scrollTop ?? 0;
        const firstVisible = Math.floor(scrollTop / rowH);

        const multiplier = this.blockMultiplier ?? 1;
        const blockSize = Math.max(1, Math.ceil(viewportRows * multiplier));
        const startBlock = Math.floor(firstVisible / blockSize) * blockSize;

        const buffer = this.buffer ?? 0;
        const start = Math.max(0, startBlock - buffer);
        const visible = Math.max(
            0,
            Math.min(total - start, blockSize + 2 * buffer)
        );

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
    updated(changedProps) {
        if (changedProps.has("items") || changedProps.has("columns")) {
            this.#computeColumnWidths();
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
                html`<th class="cell ${c.isNumeric ? "numeric" : ""}">
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

        const headerTable = html`
            <table class="header-table" role="table">
                ${colgroup}
                <thead>
                    <tr role="row">
                        ${this.#renderHeader(colsMeta)}
                    </tr>
                </thead>
            </table>
        `;

        const bodyTable = html`
            <table class="body-table">
                ${colgroup}
                <tbody>
                    <tr style="height:${topSpacer}px">
                        <td colspan="${colsMeta.length}"></td>
                    </tr>
                    ${slice.map(
                        (item, i) =>
                            html`<tr role="row">
                                ${this.#renderRow(item, colsMeta)}
                            </tr>`
                    )}
                    <tr style="height:${bottomSpacer}px">
                        <td colspan="${colsMeta.length}"></td>
                    </tr>
                </tbody>
            </table>
        `;

        return html`
            <div class="grid-root">
                <div class="hscroll" style="overflow-x:auto">
                    <div
                        style="min-width:${totalTableWidth
                            ? totalTableWidth + "px"
                            : "100%"}"
                    >
                        ${headerTable}
                        <div class="grid-body" role="grid">${bodyTable}</div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define("gs-data-grid", DataGrid);
