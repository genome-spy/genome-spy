import {
    FlexDimensions,
    getLargestSize,
    mapToPixelCoords,
    sumSizeDefs,
} from "./layout/flexLayout.js";
import Grid from "./layout/grid.js";
import Rectangle from "./layout/rectangle.js";

const COLUMN_HEADER_HEIGHT = 18;
const ROW_HEADER_WIDTH = 18;

/**
 * @typedef {object} FacetFactors
 * @prop {import("../spec/channel.js").Scalar[]} row
 * @prop {import("../spec/channel.js").Scalar[]} column
 *
 * @typedef {object} NormalizedFacet
 * @prop {import("../spec/channel.js").FieldDefWithoutScale | undefined} row
 * @prop {import("../spec/channel.js").FieldDefWithoutScale | undefined} column
 * @prop {string[]} fields
 *
 * @typedef {object} FacetCell
 * @prop {import("../spec/channel.js").Scalar[]} facetId
 * @prop {number} row
 * @prop {number} column
 * @prop {import("../spec/channel.js").Scalar | undefined} rowValue
 * @prop {import("../spec/channel.js").Scalar | undefined} columnValue
 *
 * @typedef {object} FacetGrid
 * @prop {FacetCell[]} cells
 * @prop {number} nRows
 * @prop {number} nCols
 * @prop {boolean} hasRowHeaders
 * @prop {boolean} hasColumnHeaders
 *
 * @typedef {object} FacetHeaderSizes
 * @prop {number} row
 * @prop {number} column
 *
 * @typedef {object} FacetCellLayout
 * @prop {FacetCell} cell
 * @prop {Rectangle} viewportCoords
 * @prop {Rectangle} childCoords
 */

/** @type {FacetHeaderSizes} */
export const DEFAULT_FACET_HEADER_SIZES = {
    row: ROW_HEADER_WIDTH,
    column: COLUMN_HEADER_HEIGHT,
};

/**
 * @param {NormalizedFacet} facet
 * @param {FacetFactors} factors
 * @param {number | undefined} columns
 * @returns {FacetGrid}
 */
export function createFacetGrid(facet, factors, columns) {
    if (facet.row && facet.column) {
        return createMatrixFacetGrid(factors);
    } else if (facet.row) {
        return createRowFacetGrid(factors);
    } else {
        return createColumnFacetGrid(factors, columns);
    }
}

/**
 * @param {FacetGrid} grid
 * @param {FlexDimensions} childSize
 * @param {import("./layout/padding.js").default} childOverhang
 * @param {FacetHeaderSizes} [headers]
 * @param {number} [spacing]
 * @returns {FlexDimensions}
 */
export function getFacetGridSize(
    grid,
    childSize,
    childOverhang,
    headers = DEFAULT_FACET_HEADER_SIZES,
    spacing = 0
) {
    const cellSize = getCellSize(childSize, childOverhang);
    const width = getAxisSize(
        grid.nCols,
        cellSize.width,
        grid.hasRowHeaders ? headers.row : 0,
        spacing
    );
    const height = getAxisSize(
        grid.nRows,
        cellSize.height,
        grid.hasColumnHeaders ? headers.column : 0,
        spacing
    );

    return new FlexDimensions(width, height);
}

/**
 * @param {FacetGrid} grid
 * @param {Rectangle} coords
 * @param {FlexDimensions} childSize
 * @param {import("./layout/padding.js").default} childOverhang
 * @param {FacetHeaderSizes} [headers]
 * @param {number} [spacing]
 * @param {number} [devicePixelRatio]
 * @returns {FacetCellLayout[]}
 */
export function getFacetCellLayouts(
    grid,
    coords,
    childSize,
    childOverhang,
    headers = DEFAULT_FACET_HEADER_SIZES,
    spacing = 0,
    devicePixelRatio
) {
    const cellSize = getCellSize(childSize, childOverhang);
    const columns = mapToPixelCoords(
        makeSizeItems(
            grid.nCols,
            cellSize.width,
            grid.hasRowHeaders ? headers.row : 0
        ),
        coords.width,
        {
            devicePixelRatio,
            offset: coords.x,
            spacing,
        }
    );
    const rows = mapToPixelCoords(
        makeSizeItems(
            grid.nRows,
            cellSize.height,
            grid.hasColumnHeaders ? headers.column : 0
        ),
        coords.height,
        {
            devicePixelRatio,
            offset: coords.y,
            spacing,
        }
    );
    const columnOffset = grid.hasRowHeaders ? 1 : 0;
    const rowOffset = grid.hasColumnHeaders ? 1 : 0;

    return grid.cells.map((cell) =>
        getFacetCellLayout(
            cell,
            columns,
            rows,
            columnOffset,
            rowOffset,
            childOverhang
        )
    );
}

/**
 * @param {Rectangle} rect
 * @param {{ rect: Rectangle } | undefined} clip
 * @returns {boolean}
 */
export function isRectVisible(rect, clip) {
    if (!clip) {
        return true;
    }

    const visible = rect.intersect(clip.rect);
    return visible.isDefined() && visible.width > 0 && visible.height > 0;
}

/**
 * @param {FacetFactors} factors
 * @param {number | undefined} columns
 * @returns {FacetGrid}
 */
function createColumnFacetGrid(factors, columns) {
    const grid = new Grid(factors.column.length, columns ?? Infinity);

    return {
        cells: factors.column.map((columnValue, index) => {
            const [column, row] = grid.getCellCoords(index);
            /** @type {import("../spec/channel.js").Scalar | undefined} */
            const rowValue = undefined;
            return {
                facetId: [columnValue],
                row,
                column,
                rowValue,
                columnValue,
            };
        }),
        nRows: grid.nRows,
        nCols: grid.nCols,
        hasRowHeaders: false,
        hasColumnHeaders: true,
    };
}

/**
 * @param {FacetFactors} factors
 * @returns {FacetGrid}
 */
function createRowFacetGrid(factors) {
    const grid = new Grid(factors.row.length, 1);

    return {
        cells: factors.row.map((rowValue, index) => {
            const [column, row] = grid.getCellCoords(index);
            /** @type {import("../spec/channel.js").Scalar | undefined} */
            const columnValue = undefined;
            return {
                facetId: [rowValue],
                row,
                column,
                rowValue,
                columnValue,
            };
        }),
        nRows: grid.nRows,
        nCols: grid.nCols,
        hasRowHeaders: true,
        hasColumnHeaders: false,
    };
}

/**
 * @param {FacetFactors} factors
 * @returns {FacetGrid}
 */
function createMatrixFacetGrid(factors) {
    const grid = new Grid(
        factors.row.length * factors.column.length,
        factors.column.length
    );

    return {
        cells: Array.from({ length: grid.n }, (_, index) => {
            const [column, row] = grid.getCellCoords(index);
            const rowValue = factors.row[row];
            const columnValue = factors.column[column];
            return {
                facetId: [rowValue, columnValue],
                row,
                column,
                rowValue,
                columnValue,
            };
        }),
        nRows: grid.nRows,
        nCols: grid.nCols,
        hasRowHeaders: true,
        hasColumnHeaders: true,
    };
}

/**
 * @param {FlexDimensions} childSize
 * @param {import("./layout/padding.js").default} childOverhang
 * @returns {FlexDimensions}
 */
function getCellSize(childSize, childOverhang) {
    return new FlexDimensions(
        getLargestSize([
            sumSizeDefs([childSize.width, { px: childOverhang.width }]),
        ]),
        getLargestSize([
            sumSizeDefs([childSize.height, { px: childOverhang.height }]),
        ])
    );
}

/**
 * @param {number} cellCount
 * @param {import("./layout/flexLayout.js").SizeDef} cellSize
 * @param {number} headerSize
 * @param {number} spacing
 * @returns {import("./layout/flexLayout.js").SizeDef}
 */
function getAxisSize(cellCount, cellSize, headerSize, spacing) {
    const visibleItemCount = cellCount + (headerSize > 0 ? 1 : 0);
    const totalSpacing = Math.max(0, visibleItemCount - 1) * spacing;

    return sumSizeDefs([
        sumSizeDefs(makeSizeItems(cellCount, cellSize, headerSize)),
        { px: totalSpacing },
    ]);
}

/**
 * @param {number} cellCount
 * @param {import("./layout/flexLayout.js").SizeDef} cellSize
 * @param {number} headerSize
 * @returns {import("./layout/flexLayout.js").SizeDef[]}
 */
function makeSizeItems(cellCount, cellSize, headerSize) {
    const items = Array.from({ length: cellCount }, () => cellSize);
    if (headerSize > 0) {
        items.unshift({ px: headerSize });
    }

    return items;
}

/**
 * @param {FacetCell} cell
 * @param {import("./layout/flexLayout.js").LocSize[]} columns
 * @param {import("./layout/flexLayout.js").LocSize[]} rows
 * @param {number} columnOffset
 * @param {number} rowOffset
 * @param {import("./layout/padding.js").default} childOverhang
 * @returns {FacetCellLayout}
 */
function getFacetCellLayout(
    cell,
    columns,
    rows,
    columnOffset,
    rowOffset,
    childOverhang
) {
    const column = columns[columnOffset + cell.column];
    const row = rows[rowOffset + cell.row];
    const viewportCoords = Rectangle.create(
        column.location,
        row.location,
        column.size,
        row.size
    );

    return {
        cell,
        viewportCoords,
        childCoords: viewportCoords.shrink(childOverhang),
    };
}
