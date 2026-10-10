import {
    FlexDimensions,
    mapToPixelCoords,
    sumSizeDefs,
} from "./layout/flexLayout.js";
import Grid from "./layout/grid.js";
import Padding from "./layout/padding.js";
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
 * @typedef {Grid & FacetGridContents} FacetGrid
 *
 * @typedef {object} FacetGridContents
 * @prop {FacetCell[]} cells
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

    return Object.assign(grid, {
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
        hasRowFacet: Boolean(facet.row),
        hasRowHeaders: isFacetHeaderVisible(facet.row),
        hasColumnHeaders: isFacetHeaderVisible(facet.column),
    });
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
 * @param {(cell: FacetCell) => Padding} getCellOverhang
 * @param {Required<import("../spec/view.js").FacetSpacing>} [spacing]
 * @returns {FlexDimensions}
 */
export function getFacetGridSize(
    grid,
    childSize,
    getCellOverhang,
    spacing = { row: 0, column: 0 }
) {
    const tracks = getFacetTracks(grid, childSize, getCellOverhang);
    const width = getAxisSize(
        tracks.columns,
        spacing.column,
        childSize.width.grow
    );
    const height = getAxisSize(tracks.rows, spacing.row, childSize.height.grow);

    return new FlexDimensions(width, height);
}

/**
 * @param {FacetGrid} grid
 * @param {Rectangle} coords
 * @param {FlexDimensions} childSize
 * @param {(cell: FacetCell) => Padding} getCellOverhang
 * @param {Required<import("../spec/view.js").FacetSpacing>} [spacing]
 * @param {number} [devicePixelRatio]
 * @returns {FacetCellLayout[]}
 */
export function getFacetCellLayouts(
    grid,
    coords,
    childSize,
    getCellOverhang,
    spacing = { row: 0, column: 0 },
    devicePixelRatio
) {
    const tracks = getFacetTracks(grid, childSize, getCellOverhang);
    const columns = mapToPixelCoords(tracks.columns, coords.width, {
        devicePixelRatio,
        offset: coords.x,
        spacing: spacing.column,
    });
    const rows = mapToPixelCoords(tracks.rows, coords.height, {
        devicePixelRatio,
        offset: coords.y,
        spacing: spacing.row,
    });
    const columnOffset = grid.hasRowHeaders ? 1 : 0;
    const rowOffset = grid.hasColumnHeaders ? 1 : 0;

    const rowStride = grid.hasColumnHeaders && !grid.hasRowFacet ? 2 : 1;
    return grid.cells.map((cell) => {
        const column = columns[columnOffset + cell.column];
        const row = rows[rowOffset + cell.row * rowStride];
        const columnOverhang = tracks.columnOverhangs[cell.column];
        const rowOverhang = tracks.rowOverhangs[cell.row];
        const viewportCoords = Rectangle.create(
            column.location,
            row.location,
            column.size,
            row.size
        );
        return {
            cell,
            viewportCoords,
            childCoords: viewportCoords.shrink(
                new Padding(
                    rowOverhang.top,
                    columnOverhang.right,
                    rowOverhang.bottom,
                    columnOverhang.left
                )
            ),
        };
    });
}

/**
 * @param {FacetGrid} grid
 * @param {FlexDimensions} childSize
 * @param {(cell: FacetCell) => Padding} getCellOverhang
 */
function getFacetTracks(grid, childSize, getCellOverhang) {
    const overhangs = grid.cells.map(getCellOverhang);
    // Match GridView: a track reserves the largest overhang of its cells.
    const mergeOverhangs = (/** @type {number[]} */ indices) =>
        indices.reduce(
            (padding, index) => padding.union(overhangs[index]),
            Padding.zero()
        );
    const columnOverhangs = grid.colIndices.map(mergeOverhangs);
    const rowOverhangs = grid.rowIndices.map(mergeOverhangs);

    return {
        columnOverhangs,
        rowOverhangs,
        columns: makeSizeItems(
            columnOverhangs.map(
                (padding) => childSize.addPadding(padding).width
            ),
            grid.hasRowHeaders ? FACET_HEADER_SIZES.row : 0
        ),
        rows: makeSizeItems(
            rowOverhangs.map((padding) => childSize.addPadding(padding).height),
            grid.hasColumnHeaders ? FACET_HEADER_SIZES.column : 0,
            grid.hasColumnHeaders && !grid.hasRowFacet
        ),
    };
}

/**
 * @param {import("./layout/flexLayout.js").SizeDef[]} items
 * @param {number} spacing
 * @param {number | undefined} grow
 * @returns {import("./layout/flexLayout.js").SizeDef}
 */
function getAxisSize(items, spacing, grow) {
    // Container growth and resize observation are decided before data loads.
    if (items.length === 0) {
        return { px: 0, grow: grow ?? 0 };
    }

    const totalSpacing = Math.max(0, items.length - 1) * spacing;
    items.push({ px: totalSpacing });
    return sumSizeDefs(items);
}

/**
 * @param {import("./layout/flexLayout.js").SizeDef[]} sizes
 * @param {number} headerSize
 * @param {boolean} [repeatHeader]
 * @returns {import("./layout/flexLayout.js").SizeDef[]}
 */
function makeSizeItems(sizes, headerSize, repeatHeader = false) {
    if (repeatHeader) {
        return sizes.flatMap((size) => [{ px: headerSize }, size]);
    }

    if (sizes.length && headerSize > 0) {
        sizes.unshift({ px: headerSize });
    }

    return sizes;
}
