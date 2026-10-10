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
 * @typedef {{row: Padding, column: Padding}} FacetHeaderPadding
 *
 * @typedef {object} FacetCellLayout
 * @prop {FacetCell} cell
 * @prop {Rectangle} viewportCoords
 * @prop {Rectangle} childCoords
 */

export const FACET_HEADER_SIZE = 18;

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
 * @param {FacetHeaderPadding} [headers]
 * @returns {FlexDimensions}
 */
export function getFacetGridSize(
    grid,
    childSize,
    getCellOverhang,
    spacing = { row: 0, column: 0 },
    headers
) {
    const tracks = getFacetTracks(
        grid,
        childSize,
        getCellOverhang,
        spacing,
        headers
    );
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
 * @param {FacetHeaderPadding} [headers]
 * @returns {FacetCellLayout[]}
 */
export function getFacetCellLayouts(
    grid,
    coords,
    childSize,
    getCellOverhang,
    spacing = { row: 0, column: 0 },
    devicePixelRatio,
    headers
) {
    const tracks = getFacetTracks(
        grid,
        childSize,
        getCellOverhang,
        spacing,
        headers
    );
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
    return grid.cells.map((cell) => {
        const column = columns[cell.column];
        const row = rows[cell.row];
        const columnOverhang = tracks.columnOverhangs[cell.column];
        const rowOverhang = tracks.rowOverhangs[cell.row];
        const columnHeader = tracks.columnHeaders[cell.column];
        const rowHeader = tracks.rowHeaders[cell.row];
        const viewportCoords = Rectangle.create(
            column.location,
            row.location,
            column.size,
            row.size
        ).shrink(
            new Padding(
                rowHeader.top,
                columnHeader.right,
                rowHeader.bottom,
                columnHeader.left
            )
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
 * @param {Required<import("../spec/view.js").FacetSpacing>} spacing
 * @param {FacetHeaderPadding} [headers]
 */
function getFacetTracks(
    grid,
    childSize,
    getCellOverhang,
    spacing,
    headers = {
        row: new Padding(0, 0, 0, grid.hasRowHeaders ? FACET_HEADER_SIZE : 0),
        column: new Padding(
            grid.hasColumnHeaders ? FACET_HEADER_SIZE : 0,
            0,
            0,
            0
        ),
    }
) {
    const rows = grid.rowIndices;
    const columns = grid.colIndices;
    const overhangs = grid.cells.map(getCellOverhang);
    const headerOverhangs = grid.cells.map((cell) => {
        const row = headers.row;
        const column = headers.column;
        const lastColumn = rows[cell.row].length - 1;
        const lastRow = columns[cell.column].length - 1;
        const padding = new Padding(
            row.top + (!grid.hasRowFacet || cell.row === 0 ? column.top : 0),
            column.right + (cell.column === lastColumn ? row.right : 0),
            row.bottom +
                (!grid.hasRowFacet || cell.row === lastRow ? column.bottom : 0),
            column.left + (cell.column === 0 ? row.left : 0)
        );
        return new Padding(
            padding.top > 0 ? padding.top + spacing.row : 0,
            padding.right > 0 ? padding.right + spacing.column : 0,
            padding.bottom > 0 ? padding.bottom + spacing.row : 0,
            padding.left > 0 ? padding.left + spacing.column : 0
        );
    });
    // Match GridView: each track reserves its cells' largest guide/header extent.
    const mergeOverhangs = (
        /** @type {Padding[]} */ paddings,
        /** @type {number[]} */ indices
    ) =>
        indices.reduce(
            (padding, index) => padding.union(paddings[index]),
            Padding.zero()
        );
    const columnOverhangs = columns.map((indices) =>
        mergeOverhangs(overhangs, indices)
    );
    const rowOverhangs = rows.map((indices) =>
        mergeOverhangs(overhangs, indices)
    );
    const columnHeaders = columns.map((indices) =>
        mergeOverhangs(headerOverhangs, indices)
    );
    const rowHeaders = rows.map((indices) =>
        mergeOverhangs(headerOverhangs, indices)
    );

    return {
        columnOverhangs,
        rowOverhangs,
        columnHeaders,
        rowHeaders,
        columns: columnOverhangs.map(
            (padding, index) =>
                childSize.addPadding(padding.add(columnHeaders[index])).width
        ),
        rows: rowOverhangs.map(
            (padding, index) =>
                childSize.addPadding(padding.add(rowHeaders[index])).height
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
