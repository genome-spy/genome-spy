import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";

const DEFAULT_AS = {
    row: "_legendRow",
    column: "_legendColumn",
    entryX: "_legendEntryX",
    entryY: "_legendEntryY",
    entryWidth: "_legendEntryWidth",
    entryHeight: "_legendEntryHeight",
    labelX: "_legendLabelX",
    labelY: "_legendLabelY",
};

export default class PackLabelsTransform extends Transform {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     * @param {import("../../spec/transform.js").PackLabelsParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} paramRuntimeProvider
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        this.params = params;
        this.labelWidthAccessor = field(params.labelWidth);

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
        const as = { ...DEFAULT_AS, ...params.as };
        const direction = params.direction ?? "vertical";
        const rowPadding = params.rowPadding ?? 0;
        const columnPadding = params.columnPadding ?? 0;
        const labelOffset = params.labelOffset ?? 0;
        const fontSize = params.fontSize ?? 10;
        const symbolExtent = Math.ceil(
            Math.sqrt(params.symbolSize ?? 100) +
                (params.symbolStrokeWidth ?? 0)
        );
        const entryHeight = Math.max(symbolExtent, fontSize);

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
        const rowHeights = Array.from({ length: rows }, () => entryHeight);
        /** @type {Array<{ row: number, column: number, width: number }>} */
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
            const width =
                symbolExtent + labelOffset + this.labelWidthAccessor(datum);

            entries.push({ row, column, width });
            columnWidths[column] = Math.max(columnWidths[column], width);
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

            datum[as.row] = entry.row;
            datum[as.column] = entry.column;
            datum[as.entryX] = x;
            datum[as.entryY] = y;
            datum[as.entryWidth] = columnWidths[entry.column];
            datum[as.entryHeight] = rowHeights[entry.row];
            datum[as.labelX] = x + symbolExtent + labelOffset;
            datum[as.labelY] = y + rowHeights[entry.row] / 2;

            this._propagate(datum);
        }

        super.complete();
    }
}
