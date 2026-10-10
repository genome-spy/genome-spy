import {
    FlexDimensions,
    mapToPixelCoords,
    sumSizeDefs,
} from "./layout/flexLayout.js";
import Grid from "./layout/grid.js";
import Rectangle from "./layout/rectangle.js";

/**
 * @typedef {import("./facetView.js").FacetFactors} FacetFactors
 * @typedef {import("./facetView.js").NormalizedFacet} NormalizedFacet
 *
 * @typedef {object} FacetCell
 * @prop {import("../spec/channel.js").Scalar[]} facetId
 * @prop {number} row
 * @prop {number} column
 *
 * @typedef {object} FacetGrid
 * @prop {FacetCell[]} cells
 * @prop {number} nRows
 * @prop {number} nCols
 * @prop {boolean} hasRowFacet
 * @prop {boolean} hasRowHeaders
 * @prop {boolean} hasColumnHeaders
 *
 * @typedef {object} FacetCellLayout
 * @prop {FacetCell} cell
 * @prop {Rectangle} viewportCoords
 * @prop {Rectangle} childCoords
 */

export const FACET_HEADER_SIZES = {
    row: 18,
    column: 18,
};

/**
 * @param {NormalizedFacet} facet
 * @param {FacetFactors} factors
 * @param {number | undefined} columns
 * @returns {FacetGrid}
 */
export function createFacetGrid(facet, factors, columns) {
    const n =
        (facet.row ? factors.row.length : 1) *
        (facet.column ? factors.column.length : 1);
    const maxCols = facet.row
        ? facet.column
            ? factors.column.length || 1
            : 1
        : (columns ?? Infinity);
    const grid = new Grid(n, maxCols);

    return {
        cells: Array.from({ length: n }, (_, index) => {
            const [column, row] = grid.getCellCoords(index);
            const facetId = [];
            if (facet.row) {
                facetId.push(factors.row[row]);
            }
            if (facet.column) {
                facetId.push(factors.column[facet.row ? column : index]);
            }
            return { facetId, row, column };
        }),
        nRows: grid.nRows,
        nCols: grid.nCols,
        hasRowFacet: Boolean(facet.row),
        hasRowHeaders: isFacetHeaderVisible(facet.row),
        hasColumnHeaders: isFacetHeaderVisible(facet.column),
    };
}

/** @param {import("../spec/channel.js").FacetFieldDef | undefined} field */
export function isFacetHeaderVisible(field) {
    return (
        field !== undefined &&
        field.header !== null &&
        field.header?.labels !== false
    );
}

/**
 * @param {FacetGrid} grid
 * @param {FlexDimensions} childSize
 * @param {import("./layout/padding.js").default} childOverhang
 * @param {Required<import("../spec/view.js").FacetSpacing>} [spacing]
 * @returns {FlexDimensions}
 */
export function getFacetGridSize(
    grid,
    childSize,
    childOverhang,
    spacing = { row: 0, column: 0 }
) {
    const cellSize = childSize.addPadding(childOverhang);
    const width = getAxisSize(
        grid.nCols,
        cellSize.width,
        grid.hasRowHeaders ? FACET_HEADER_SIZES.row : 0,
        spacing.column
    );
    const height = getAxisSize(
        grid.nRows,
        cellSize.height,
        grid.hasColumnHeaders ? FACET_HEADER_SIZES.column : 0,
        spacing.row,
        grid.hasColumnHeaders && !grid.hasRowFacet
    );

    return new FlexDimensions(width, height);
}

/**
 * @param {FacetGrid} grid
 * @param {Rectangle} coords
 * @param {FlexDimensions} childSize
 * @param {import("./layout/padding.js").default} childOverhang
 * @param {Required<import("../spec/view.js").FacetSpacing>} [spacing]
 * @param {number} [devicePixelRatio]
 * @returns {FacetCellLayout[]}
 */
export function getFacetCellLayouts(
    grid,
    coords,
    childSize,
    childOverhang,
    spacing = { row: 0, column: 0 },
    devicePixelRatio
) {
    const cellSize = childSize.addPadding(childOverhang);
    const columns = mapToPixelCoords(
        makeSizeItems(
            grid.nCols,
            cellSize.width,
            grid.hasRowHeaders ? FACET_HEADER_SIZES.row : 0
        ),
        coords.width,
        {
            devicePixelRatio,
            offset: coords.x,
            spacing: spacing.column,
        }
    );
    const rows = mapToPixelCoords(
        makeSizeItems(
            grid.nRows,
            cellSize.height,
            grid.hasColumnHeaders ? FACET_HEADER_SIZES.column : 0,
            grid.hasColumnHeaders && !grid.hasRowFacet
        ),
        coords.height,
        {
            devicePixelRatio,
            offset: coords.y,
            spacing: spacing.row,
        }
    );
    const columnOffset = grid.hasRowHeaders ? 1 : 0;
    const rowOffset = grid.hasColumnHeaders ? 1 : 0;

    const rowStride = grid.hasColumnHeaders && !grid.hasRowFacet ? 2 : 1;
    return grid.cells.map((cell) => {
        const column = columns[columnOffset + cell.column];
        const row = rows[rowOffset + cell.row * rowStride];
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
    });
}

/**
 * @param {number} cellCount
 * @param {import("./layout/flexLayout.js").SizeDef} cellSize
 * @param {number} headerSize
 * @param {number} spacing
 * @param {boolean} [repeatHeader]
 * @returns {import("./layout/flexLayout.js").SizeDef}
 */
function getAxisSize(
    cellCount,
    cellSize,
    headerSize,
    spacing,
    repeatHeader = false
) {
    // Container growth and resize observation are decided before data loads.
    if (cellCount === 0) {
        return { px: 0, grow: cellSize.grow ?? 0 };
    }

    const items = makeSizeItems(cellCount, cellSize, headerSize, repeatHeader);
    const totalSpacing = Math.max(0, items.length - 1) * spacing;
    items.push({ px: totalSpacing });
    return sumSizeDefs(items);
}

/**
 * @param {number} cellCount
 * @param {import("./layout/flexLayout.js").SizeDef} cellSize
 * @param {number} headerSize
 * @param {boolean} [repeatHeader]
 * @returns {import("./layout/flexLayout.js").SizeDef[]}
 */
function makeSizeItems(cellCount, cellSize, headerSize, repeatHeader = false) {
    if (repeatHeader) {
        return Array.from({ length: cellCount }, () => [
            { px: headerSize },
            cellSize,
        ]).flat();
    }

    const items = Array.from({ length: cellCount }, () => cellSize);
    if (headerSize > 0) {
        items.unshift({ px: headerSize });
    }

    return items;
}
