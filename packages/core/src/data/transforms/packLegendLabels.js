import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";

/**
 * @param {unknown} symbolSize
 * @param {number} symbolStrokeWidth
 */
function getSymbolExtent(symbolSize, symbolStrokeWidth) {
    const size = Number(symbolSize);
    const area = Number.isFinite(size) && size >= 0 ? size : 100;
    return Math.sqrt(area) + symbolStrokeWidth;
}

export default class PackLegendLabelsTransform extends Transform {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     * @param {import("../../spec/transform.js").PackLegendLabelsParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} paramRuntimeProvider
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        this.params = params;
        this.labelWidthAccessor = field(params.labelWidth);
        this.symbolSizeAccessor =
            typeof params.symbolSize == "string"
                ? field(params.symbolSize)
                : () => params.symbolSize ?? 100;
        /** @type {number | undefined} */
        this.yExtent = undefined;

        if (isExprRef(params.yExtent)) {
            const yExtentExpr = this.paramRuntime.watchExpression(
                params.yExtent.expr,
                () => {
                    this.yExtent = yExtentExpr();
                    this.repropagate();
                },
                {
                    scopeOwned: false,
                    registerDisposer: (disposer) =>
                        this.registerDisposer(disposer),
                }
            );
            this.yExtent = yExtentExpr();
        } else {
            this.yExtent = params.yExtent;
        }

        /** @type {any[]} */
        this.buffer = [];
    }

    reset() {
        super.reset();
        this.buffer = [];
    }

    /**
     * @param {any} datum
     */
    handle(datum) {
        this.buffer.push(datum);
    }

    complete() {
        const params = this.params;
        const direction = params.direction ?? "vertical";
        const rowPadding = params.rowPadding ?? 0;
        const columnPadding = params.columnPadding ?? 0;
        const labelOffset = params.labelOffset ?? 0;
        const fontSize = params.fontSize ?? 10;
        const xOffset = params.xOffset ?? 0;
        const yOffset = params.yOffset ?? 0;
        const yExtent = this.yExtent;
        const symbolStrokeWidth = params.symbolStrokeWidth ?? 0;

        /** @type {number} */
        const n = this.buffer.length;
        const columns =
            params.columns && params.columns > 0
                ? params.columns
                : direction == "horizontal"
                  ? n
                  : 1;
        const rows = Math.ceil(n / Math.max(columns, 1));

        /** @type {number[]} */
        const columnWidths = Array.from({ length: columns }, () => 0);
        /** @type {number[]} */
        const columnSymbolExtents = Array.from({ length: columns }, () => 0);
        /** @type {number[]} */
        const columnLabelWidths = Array.from({ length: columns }, () => 0);
        /** @type {number[]} */
        const rowHeights = Array.from({ length: rows }, () => 0);
        /** @type {Array<{ row: number, column: number, symbolExtent: number }>} */
        const entries = [];

        for (let index = 0; index < n; index++) {
            const datum = this.buffer[index];
            const row =
                direction == "horizontal"
                    ? Math.floor(index / columns)
                    : index % rows;
            const column =
                direction == "horizontal"
                    ? index % columns
                    : Math.floor(index / rows);
            const symbolExtent = getSymbolExtent(
                this.symbolSizeAccessor(datum),
                symbolStrokeWidth
            );
            const labelWidth = this.labelWidthAccessor(datum);

            entries.push({ row, column, symbolExtent });
            columnSymbolExtents[column] = Math.max(
                columnSymbolExtents[column],
                symbolExtent
            );
            columnLabelWidths[column] = Math.max(
                columnLabelWidths[column],
                labelWidth
            );
            rowHeights[row] = Math.max(rowHeights[row], symbolExtent, fontSize);
        }

        for (let column = 0; column < columns; column++) {
            columnWidths[column] =
                columnSymbolExtents[column] +
                labelOffset +
                columnLabelWidths[column];
        }

        /** @type {number[]} */
        const columnX = [];
        for (let column = 0, x = 0; column < columns; column++) {
            columnX[column] = x;
            x += columnWidths[column] + columnPadding;
        }

        /** @type {number[]} */
        const rowY = [];
        for (let row = 0, y = 0; row < rows; row++) {
            rowY[row] = y;
            y += rowHeights[row] + rowPadding;
        }

        for (let index = 0; index < n; index++) {
            const datum = this.buffer[index];
            const entry = entries[index];
            const x = columnX[entry.column];
            const y = rowY[entry.row];
            const symbolSlotWidth = columnSymbolExtents[entry.column];
            const symbolCenterOffset = symbolSlotWidth / 2;

            datum.row = entry.row;
            datum.column = entry.column;
            const entryY = y + yOffset;
            const labelY = y + yOffset + rowHeights[entry.row] / 2;

            datum.entryX = x + xOffset + symbolCenterOffset;
            datum.entryY = entryY;
            datum.entryWidth = columnWidths[entry.column];
            datum.entryHeight = rowHeights[entry.row];
            datum.labelX = x + xOffset + symbolSlotWidth + labelOffset;
            datum.labelY = labelY;
            if (yExtent != null) {
                datum.entryY2 = yExtent - entryY;
                datum.labelY2 = yExtent - labelY;
            }

            this._propagate(datum);
        }

        super.complete();
    }
}
