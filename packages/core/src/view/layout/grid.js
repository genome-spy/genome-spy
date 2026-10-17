/** Indexes a wrapping grid or explicitly positioned cells, retaining child order. */
export default class Grid {
    /** @type {[number, number][] | undefined} Explicit coordinates for sparse grids. */
    #cells;

    /**
     * @param {number | [number, number][]} cells Child count or column/row coordinates.
     * @param {number} [maxCols]
     */
    constructor(cells, maxCols = Infinity) {
        this.n = typeof cells === "number" ? cells : cells.length;
        this.maxCols = maxCols;
        this.#cells = typeof cells === "number" ? undefined : cells;
    }

    get nRows() {
        return this.#cells
            ? Math.max(-1, ...this.#cells.map(([, row]) => row)) + 1
            : this.maxCols === Infinity
              ? 1
              : Math.ceil(this.n / this.maxCols);
    }

    get nCols() {
        return this.#cells
            ? Math.max(-1, ...this.#cells.map(([column]) => column)) + 1
            : Math.min(this.n, this.maxCols);
    }

    get rowIndices() {
        return this.#getIndices(1, this.nRows);
    }

    get colIndices() {
        return this.#getIndices(0, this.nCols);
    }

    /** @param {0 | 1} dimension @param {number} count */
    #getIndices(dimension, count) {
        /** @type {number[][]} */
        const tracks = [];
        if (this.#cells) {
            for (let track = 0; track < count; track++) {
                tracks.push([]);
            }
            for (let index = 0; index < this.n; index++) {
                tracks[this.#cells[index][dimension]].push(index);
            }
        } else {
            const nCols = this.nCols;
            const step = dimension === 0 ? nCols : 1;
            for (let track = 0; track < count; track++) {
                const first = dimension === 0 ? track : track * nCols;
                const end =
                    dimension === 0 ? this.n : Math.min(this.n, first + nCols);
                const indices = [];
                for (let index = first; index < end; index += step) {
                    indices.push(index);
                }
                tracks.push(indices);
            }
        }
        return tracks;
    }

    /** @param {number} column @param {number} row */
    getCellIndex(column, row) {
        const index = this.#cells
            ? this.#cells.findIndex(([col, r]) => col === column && r === row)
            : row * this.nCols + column;
        return column < this.nCols && index >= 0 && index < this.n
            ? index
            : undefined;
    }

    /** @param {number} index @returns {[number, number] | undefined} */
    getCellCoords(index) {
        if (index < 0 || index >= this.n) {
            return;
        }
        return this.#cells
            ? this.#cells[index]
            : [index % this.nCols, Math.floor(index / this.nCols)];
    }
}
