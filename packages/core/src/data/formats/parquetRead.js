import { parquetMetadataAsync, parquetSchema } from "hyparquet/src/metadata.js";
import { parquetPlan, prefetchAsyncBuffer } from "hyparquet/src/plan.js";
import { assembleAsync, readRowGroup } from "hyparquet/src/rowgroup.js";
import { concat } from "hyparquet/src/utils.js";

/**
 * @param {Omit<import("hyparquet").ParquetReadOptions, "rowFormat" | "filter" | "filterStrict">} options
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
    const asyncPages = await Promise.all(
        asyncColumns.map(async ({ data }) => {
            const pages = await data;
            return {
                skipped: pages.skipped,
                data: flattenColumnChunks(pages.data),
            };
        })
    );

    const columnNames = asyncColumns.map((column) => column.pathInSchema[0]);
    const selectCount = selectEnd - selectStart;

    /** @type {Record<string, any>[]} */
    const groupData = Array(selectCount);
    for (let selectRow = 0; selectRow < selectCount; selectRow++) {
        const row = selectStart + selectRow;
        /** @type {Record<string, any>} */
        const rowData = {};
        for (let i = 0; i < asyncColumns.length; i++) {
            const { data, skipped } = asyncPages[i];
            rowData[columnNames[i]] = data[row - skipped];
        }
        groupData[selectRow] = rowData;
    }

    return groupData;
}

/**
 * @param {Omit<import("hyparquet").ParquetReadOptions, "rowFormat" | "filter" | "filterStrict">} options
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
                asyncColumn.data.then(({ data, skipped }) => {
                    let chunkRowStart = asyncGroup.groupStart + skipped;
                    for (const columnData of data) {
                        onChunk({
                            columnName: asyncColumn.pathInSchema[0],
                            columnData,
                            rowStart: chunkRowStart,
                            rowEnd: chunkRowStart + columnData.length,
                        });
                        chunkRowStart += columnData.length;
                    }
                });
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
 * @param {Omit<import("hyparquet").ParquetReadOptions, "onComplete" | "rowFormat" | "filter" | "filterStrict">} options
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
