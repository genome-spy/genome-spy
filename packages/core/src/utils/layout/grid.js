/**
 * An utility class for indexing cells in a wrapping grid layout
 */
export default class Grid {
    /**
     *
     * @param {number} nChildren
     * @param {number} [maxCols]
     */
    constructor(nChildren, maxCols) {
        this.n = nChildren;
        this.maxCols = maxCols ?? Infinity;
    }

    get nRows() {
        return this.maxCols == Infinity ? 1 : Math.ceil(this.n / this.maxCols);
    }

    get nCols() {
        return Math.min(this.n, this.maxCols);
    }

    get rowIndices() {
        /** @type {number[][]} */
        const rows = [];

        const nCols = this.nCols;
        const nRows = this.nRows;

        for (let row = 0; row < nRows; row++) {
            /** @type {number[]} */
            const arr = [];
            rows.push(arr);
            for (let col = 0; col < nCols; col++) {
                const i = row * nCols + col;
                if (i < this.n) {
                    arr.push(i);
                }
            }
        }
        return rows;
    }

    get colIndices() {
        /** @type {number[][]} */
        const cols = [];

        const nCols = this.nCols;
        const nRows = this.nRows;

        for (let col = 0; col < nCols; col++) {
            /** @type {number[]} */
            const arr = [];
            cols.push(arr);
            for (let row = 0; row < nRows; row++) {
                const i = row * nCols + col;
                if (i < this.n) {
                    arr.push(i);
                }
            }
        }
        return cols;
    }

    /**
     * @param {number} col
     * @param {number} row
     */
    getCellIndex(col, row) {
        let i = 0;

        if (this.maxCols == Infinity) {
            i = row == 0 ? col : undefined;
        } else if (col >= this.maxCols) {
            return undefined;
        } else {
            i = row * this.nCols + col;
        }

        return i < this.n ? i : undefined;
    }

    /**
     *
     * @param {number} index
     * @returns {[number, number]}
     */
    getCellCoords(index) {
        if (index < 0 || index >= this.n) {
            return undefined;
        }

        return [index % this.nCols, Math.floor(index / this.nCols)];
    }
}
