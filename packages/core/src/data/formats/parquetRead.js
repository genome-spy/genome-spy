/*
 * Adapted from hyparquet internals:
 * https://github.com/hyparam/hyparquet (notably src/read.js and src/rowgroup.js).
 *
 * GenomeSpy-specific changes in this copy:
 * - object-row output only (array row format removed)
 * - filtering support removed
 * - hot row transpose path optimized with cached codegen for typical schemas
 * - fallback to interpreted row builder for very wide schemas
 */

import { parquetMetadataAsync, parquetSchema } from "hyparquet/src/metadata.js";
import { parquetPlan, prefetchAsyncBuffer } from "hyparquet/src/plan.js";
import { assembleAsync, readRowGroup } from "hyparquet/src/rowgroup.js";
import { concat } from "hyparquet/src/utils.js";

/**
 * Object-row variant of Parquet read options used by this trimmed reader.
 *
 * @typedef {Omit<
 *  import("hyparquet").ParquetReadOptions,
 *  "rowFormat" | "filter" | "filterStrict" | "onComplete"
 * > & {
 *  onComplete?: (rows: Record<string, any>[]) => void
 * }} ObjectParquetReadOptions
 */

/**
 * @typedef {(
 *  groupData: Record<string, any>[],
 *  selectStart: number,
 *  selectCount: number,
 *  columnData: import("hyparquet").DecodedArray[],
 *  columnSkipped: number[]
 * ) => Record<string, any>[]} RowGroupObjectBuilder
 */

/** @type {Map<string, RowGroupObjectBuilder>} */
const rowGroupObjectBuilderCache = new Map();

const MAX_CODEGEN_COLUMNS = 200;

/**
 * @param {ObjectParquetReadOptions} options
 * @returns {import("hyparquet").AsyncRowGroup[]}
 */
function parquetReadAsync(options) {
    if (!options.metadata) {
        throw new Error("parquet requires metadata");
    }

    const plan = parquetPlan(options);
    options.file = prefetchAsyncBuffer(options.file, plan);

    return plan.groups.map((groupPlan) =>
        readRowGroup(options, plan, groupPlan)
    );
}

/**
 * Flatten decoded data pages into a single decoded array.
 * This local version avoids chunked slice/push overhead in hot paths.
 *
 * @param {import("hyparquet").DecodedArray[] | undefined} chunks
 * @returns {import("hyparquet").DecodedArray}
 */
function flattenColumnChunks(chunks) {
    if (!chunks) {
        return [];
    }

    if (chunks.length === 1) {
        return chunks[0];
    }

    let totalLength = 0;
    for (const chunk of chunks) {
        totalLength += chunk.length;
    }

    const output = Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        for (let i = 0; i < chunk.length; i++) {
            output[offset + i] = chunk[i];
        }
        offset += chunk.length;
    }

    return output;
}

/**
 * @param {string[]} columnNames
 * @returns {RowGroupObjectBuilder}
 */
function getRowGroupObjectBuilder(columnNames) {
    // Compile one builder per column layout to keep object writes monomorphic.
    const signature = columnNames.join("\u001f");
    const cached = rowGroupObjectBuilderCache.get(signature);
    if (cached) {
        return cached;
    }

    const assignments = columnNames
        .map(
            (columnName, i) =>
                JSON.stringify(columnName) +
                ": columnData[" +
                i +
                "][row - columnSkipped[" +
                i +
                "]]"
        )
        .join(",\n");

    const builder = /** @type {RowGroupObjectBuilder} */ (
        new Function(
            "groupData",
            "selectStart",
            "selectCount",
            "columnData",
            "columnSkipped",
            // Keep generated code focused on the tight row loop only.
            "for (let selectRow = 0; selectRow < selectCount; selectRow++) {\n" +
                "    const row = selectStart + selectRow;\n" +
                "    groupData[selectRow] = {\n" +
                assignments +
                "\n" +
                "    };\n" +
                "}\n" +
                "return groupData;"
        )
    );

    rowGroupObjectBuilderCache.set(signature, builder);

    return builder;
}

/**
 * @param {Record<string, any>[]} groupData
 * @param {number} selectStart
 * @param {number} selectCount
 * @param {string[]} columnNames
 * @param {import("hyparquet").DecodedArray[]} columnData
 * @param {number[]} columnSkipped
 * @returns {Record<string, any>[]}
 */
function buildRowsInterpreted(
    groupData,
    selectStart,
    selectCount,
    columnNames,
    columnData,
    columnSkipped
) {
    for (let selectRow = 0; selectRow < selectCount; selectRow++) {
        const row = selectStart + selectRow;
        /** @type {Record<string, any>} */
        const rowData = {};
        for (let i = 0; i < columnNames.length; i++) {
            rowData[columnNames[i]] = columnData[i][row - columnSkipped[i]];
        }
        groupData[selectRow] = rowData;
    }

    return groupData;
}

/**
 * Object-only copy of hyparquet's asyncGroupToRows.
 *
 * @param {import("hyparquet").AsyncRowGroup} asyncGroup
 * @param {number} selectStart
 * @param {number} selectEnd
 * @returns {Promise<Record<string, any>[]>}
 */
async function asyncGroupToRowsObject(
    { asyncColumns },
    selectStart,
    selectEnd
) {
    // Resolve all async column pages once before entering the hot transpose loop.
    const pages = await Promise.all(asyncColumns.map((column) => column.data));
    const columnCount = asyncColumns.length;

    /** @type {string[]} */
    const columnNames = Array(columnCount);
    /** @type {import("hyparquet").DecodedArray[]} */
    const columnData = Array(columnCount);
    /** @type {number[]} */
    const columnSkipped = Array(columnCount);

    // Precompute all indirections outside the generated function.
    for (let i = 0; i < columnCount; i++) {
        columnNames[i] = asyncColumns[i].pathInSchema[0];
        columnData[i] = flattenColumnChunks(pages[i].data);
        columnSkipped[i] = pages[i].skipped;
    }

    const selectCount = selectEnd - selectStart;

    /** @type {Record<string, any>[]} */
    const groupData = Array(selectCount);

    // Avoid excessively large generated functions for very wide schemas.
    if (columnCount > MAX_CODEGEN_COLUMNS) {
        return buildRowsInterpreted(
            groupData,
            selectStart,
            selectCount,
            columnNames,
            columnData,
            columnSkipped
        );
    }

    const buildRows = getRowGroupObjectBuilder(columnNames);

    return buildRows(
        groupData,
        selectStart,
        selectCount,
        columnData,
        columnSkipped
    );
}

/**
 * @param {ObjectParquetReadOptions} options
 * @returns {Promise<void>}
 */
export async function parquetRead(options) {
    if ("rowFormat" in options) {
        throw new Error(
            'parquetRead supports only object rows; use rowFormat: "object" implicitly'
        );
    }
    if ("filter" in options || "filterStrict" in options) {
        throw new Error("parquetRead does not support filtering");
    }

    options.metadata ??= await parquetMetadataAsync(options.file, options);

    const { rowStart = 0, rowEnd, onChunk, onComplete } = options;

    const asyncGroups = parquetReadAsync(options);

    if (!onComplete && !onChunk) {
        for (const { asyncColumns } of asyncGroups) {
            for (const { data } of asyncColumns) {
                await data;
            }
        }
        return;
    }

    const schemaTree = parquetSchema(options.metadata);
    const assembled = asyncGroups.map((group) =>
        assembleAsync(group, schemaTree, options.parsers)
    );

    if (onChunk) {
        for (const asyncGroup of assembled) {
            for (const asyncColumn of asyncGroup.asyncColumns) {
                asyncColumn.data.then(
                    /**
                     * @param {{ data: import("hyparquet").DecodedArray[]; skipped: number }} chunk
                     */
                    (chunk) => {
                        let chunkRowStart =
                            asyncGroup.groupStart + chunk.skipped;
                        for (const columnData of chunk.data) {
                            onChunk({
                                columnName: asyncColumn.pathInSchema[0],
                                columnData,
                                rowStart: chunkRowStart,
                                rowEnd: chunkRowStart + columnData.length,
                            });
                            chunkRowStart += columnData.length;
                        }
                    }
                );
            }
        }
    }

    if (onComplete) {
        /** @type {Record<string, any>[]} */
        const rows = [];
        for (const asyncGroup of assembled) {
            const selectStart = Math.max(rowStart - asyncGroup.groupStart, 0);
            const selectEnd = Math.min(
                (rowEnd ?? Infinity) - asyncGroup.groupStart,
                asyncGroup.groupRows
            );
            const groupData = await asyncGroupToRowsObject(
                asyncGroup,
                selectStart,
                selectEnd
            );
            concat(rows, groupData);
        }
        onComplete(rows);
    } else {
        for (const { asyncColumns } of assembled) {
            for (const { data } of asyncColumns) {
                await data;
            }
        }
    }
}

/**
 * @param {Omit<ObjectParquetReadOptions, "onComplete">} options
 * @returns {Promise<Record<string, any>[]>}
 */
export function parquetReadObjects(options) {
    return new Promise((onComplete, reject) => {
        parquetRead({
            ...options,
            onComplete,
        }).catch(reject);
    });
}
