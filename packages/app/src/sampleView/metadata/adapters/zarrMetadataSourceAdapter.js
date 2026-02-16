import { concatUrl } from "@genome-spy/core/utils/url.js";
import {
    FetchStore,
    get as zarrGet,
    open as zarrOpen,
    root as zarrRoot,
    slice as zarrSlice,
} from "zarrita";
import { validateMetadata } from "../uploadMetadataDialog.js";
import { wrangleMetadata } from "../metadataUtils.js";

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 * @typedef {import("@genome-spy/app/spec/sampleView.js").ZarrBackendDef} ZarrBackendDef
 */

/**
 * @param {string} path
 * @returns {string}
 */
function normalizePath(path) {
    return path.startsWith("/") ? path.slice(1) : path;
}

/**
 * @param {{ data: any; shape: number[]; stride: number[] }} chunk
 * @returns {any[]}
 */
function flatten1dChunk(chunk) {
    if (chunk.shape.length !== 1) {
        throw new Error("Expected a one-dimensional Zarr selection result.");
    }

    const length = chunk.shape[0];
    const stride = chunk.stride[0];

    /** @type {any[]} */
    const values = [];
    for (let i = 0; i < length; i++) {
        const index = i * stride;
        if (typeof chunk.data?.get === "function") {
            values.push(chunk.data.get(index));
        } else {
            values.push(chunk.data[index]);
        }
    }

    return values;
}

/**
 * @param {Map<string, Set<number>>} lookup
 * @param {unknown} term
 * @param {number} index
 * @param {{ stripVersionSuffix?: boolean }} [options]
 */
function addTerm(lookup, term, index, options = {}) {
    const raw = String(term ?? "").trim();
    if (raw.length === 0) {
        return;
    }

    /** @type {Set<string>} */
    const variants = new Set([raw, raw.toLowerCase()]);
    if (options.stripVersionSuffix) {
        const stripped = raw.replace(/\.\d+$/, "");
        variants.add(stripped);
        variants.add(stripped.toLowerCase());
    }

    for (const variant of variants) {
        let mapped = lookup.get(variant);
        if (!mapped) {
            mapped = new Set();
            lookup.set(variant, mapped);
        }
        mapped.add(index);
    }
}

export default class ZarrMetadataSourceAdapter {
    /** @type {MetadataSourceDef} */
    #source;

    /** @type {ZarrBackendDef} */
    #backend;

    /** @type {FetchStore} */
    #store;

    /** @type {Promise<string[]> | undefined} */
    #columnIdsPromise;

    /** @type {Promise<string[]> | undefined} */
    #rowIdsPromise;

    /** @type {Promise<Map<string, number>> | undefined} */
    #columnIndexByIdPromise;

    /** @type {Promise<Map<string, Set<number>>> | undefined} */
    #lookupPromise;

    /** @type {Set<string>} */
    #excludedColumns;

    /**
     * @param {MetadataSourceDef} source
     * @param {{ baseUrl?: string }} [options]
     */
    constructor(source, options = {}) {
        this.#source = source;
        this.#backend =
            /** @type {ZarrBackendDef} */
            (source.backend);
        this.#store = new FetchStore(
            concatUrl(options.baseUrl, this.#backend.url)
        );
        this.#excludedColumns = new Set(source.excludeColumns ?? []);
    }

    /**
     * @param {AbortSignal} [signal]
     * @returns {Promise<{ id: string }[]>}
     */
    async listColumns(signal) {
        const columnIds = await this.#getColumnIds(signal);
        return columnIds
            .filter((id) => !this.#isExcludedColumn(id))
            .map((id) => ({ id }));
    }

    /**
     * @param {AbortSignal} [signal]
     * @returns {Promise<string[]>}
     */
    async listSampleIds(signal) {
        return this.#getRowIds(signal);
    }

    /**
     * @param {string[]} queries
     * @param {AbortSignal} [signal]
     * @returns {Promise<{ columnIds: string[]; missing: string[]; ambiguous: string[] }>}
     */
    async resolveColumns(queries, signal) {
        const lookup = await this.#getLookup(signal);
        const columnIds = await this.#getColumnIds(signal);

        /** @type {string[]} */
        const resolved = [];
        /** @type {Set<string>} */
        const missing = new Set();
        /** @type {Set<string>} */
        const ambiguous = new Set();

        for (const query of queries) {
            const term = String(query).trim();
            const mapped = lookup.get(term) ?? lookup.get(term.toLowerCase());
            if (!mapped || mapped.size === 0) {
                missing.add(query);
                continue;
            }

            if (mapped.size > 1) {
                ambiguous.add(query);
                continue;
            }

            const columnIndex = Array.from(mapped)[0];
            const columnId = columnIds[columnIndex];
            if (!resolved.includes(columnId)) {
                resolved.push(columnId);
            }
        }

        return {
            columnIds: resolved,
            missing: Array.from(missing),
            ambiguous: Array.from(ambiguous),
        };
    }

    /**
     * @param {{
     *   columnIds: string[];
     *   sampleIds: string[];
     *   groupPath?: string;
     *   replace?: boolean;
     * }} request
     * @param {AbortSignal} [signal]
     * @returns {Promise<import("../../state/payloadTypes.js").SetMetadata>}
     */
    async fetchColumns(request, signal) {
        const valuesArray = await this.#getValuesArray();
        const rowIds = await this.#getRowIds(signal);
        const columnIndexById = await this.#getColumnIndexById(signal);

        const rowIndexBySampleId = new Map(
            rowIds.map((sampleId, index) => [sampleId, index])
        );
        const matchedSampleIds = request.sampleIds.filter((sampleId) =>
            rowIndexBySampleId.has(sampleId)
        );

        if (matchedSampleIds.length === 0) {
            throw new Error(
                "Metadata source rows do not match any sample ids in the current view."
            );
        }

        for (const columnId of request.columnIds) {
            if (this.#isExcludedColumn(columnId)) {
                throw new Error(
                    'Column "' +
                        columnId +
                        '" is excluded by metadata source configuration.'
                );
            }
        }

        /** @type {Record<string, any>[]} */
        const rows = matchedSampleIds.map((sampleId) => ({ sample: sampleId }));

        for (const columnId of request.columnIds) {
            const columnIndex = columnIndexById.get(columnId);
            if (columnIndex === undefined) {
                throw new Error(
                    'Column "' +
                        columnId +
                        '" was not found in Zarr metadata source.'
                );
            }

            const columnChunk =
                /** @type {{ data: any; shape: number[]; stride: number[] }} */ (
                    await zarrGet(
                        valuesArray,
                        [zarrSlice(null), columnIndex],
                        signal ? { opts: { signal } } : undefined
                    )
                );
            const columnValues = flatten1dChunk(columnChunk);

            for (let i = 0; i < matchedSampleIds.length; i++) {
                const rowIndex = rowIndexBySampleId.get(matchedSampleIds[i]);
                rows[i][columnId] = columnValues[rowIndex];
            }
        }

        const validation = validateMetadata(request.sampleIds, rows);
        if ("error" in validation) {
            const firstError = validation.error[0];
            throw new Error(
                "Invalid metadata source payload: " + String(firstError.message)
            );
        }

        /** @type {Record<string, import("@genome-spy/app/spec/sampleView.js").SampleAttributeDef>} */
        const attributeDefs = {};
        for (const columnId of request.columnIds) {
            if (this.#source.columnDefs?.[columnId]) {
                attributeDefs[columnId] = {
                    ...this.#source.columnDefs[columnId],
                };
            } else if (this.#source.defaultAttributeDef) {
                attributeDefs[columnId] = {
                    ...this.#source.defaultAttributeDef,
                };
            }
        }

        const groupPath = request.groupPath ?? this.#source.groupPath;
        const setMetadata = wrangleMetadata(
            rows,
            attributeDefs,
            this.#source.attributeGroupSeparator,
            groupPath
        );

        if (request.replace !== undefined) {
            setMetadata.replace = request.replace;
        }

        return setMetadata;
    }

    async #getValuesArray() {
        this.#requireMatrixLayout();

        const path = normalizePath(this.#backend.matrix?.valuesPath ?? "X");
        const location = zarrRoot(this.#store).resolve(path);
        return zarrOpen(location, { kind: "array" });
    }

    /**
     * @param {AbortSignal} [signal]
     */
    async #getColumnIds(signal) {
        if (!this.#columnIdsPromise) {
            this.#columnIdsPromise = this.#readStringArray(
                this.#backend.matrix?.columnIdsPath ?? "var_names",
                signal
            );
        }
        return this.#columnIdsPromise;
    }

    /**
     * @param {AbortSignal} [signal]
     */
    async #getRowIds(signal) {
        if (!this.#rowIdsPromise) {
            this.#rowIdsPromise = this.#readStringArray(
                this.#backend.matrix?.rowIdsPath ?? "obs_names",
                signal
            );
        }
        return this.#rowIdsPromise;
    }

    /**
     * @param {AbortSignal} [signal]
     */
    async #getColumnIndexById(signal) {
        if (!this.#columnIndexByIdPromise) {
            this.#columnIndexByIdPromise = this.#getColumnIds(signal).then(
                (columnIds) =>
                    new Map(
                        columnIds.map((columnId, index) => [columnId, index])
                    )
            );
        }
        return this.#columnIndexByIdPromise;
    }

    /**
     * @param {AbortSignal} [signal]
     */
    async #getLookup(signal) {
        if (!this.#lookupPromise) {
            this.#lookupPromise = this.#buildLookup(signal);
        }
        return this.#lookupPromise;
    }

    /**
     * @param {AbortSignal} [signal]
     * @returns {Promise<Map<string, Set<number>>>}
     */
    async #buildLookup(signal) {
        this.#requireMatrixLayout();

        const columnIds = await this.#getColumnIds(signal);
        /** @type {Map<string, Set<number>>} */
        const lookup = new Map();

        for (let i = 0; i < columnIds.length; i++) {
            if (this.#isExcludedColumn(columnIds[i])) {
                continue;
            }
            addTerm(lookup, columnIds[i], i);
        }

        for (const identifier of this.#backend.identifiers ?? []) {
            const identifierValues = await this.#readArray(
                identifier.path,
                signal
            );
            if (identifierValues.length !== columnIds.length) {
                throw new Error(
                    'Identifier array "' +
                        identifier.path +
                        '" does not match the number of matrix columns.'
                );
            }

            for (let i = 0; i < identifierValues.length; i++) {
                if (this.#isExcludedColumn(columnIds[i])) {
                    continue;
                }
                addTerm(lookup, identifierValues[i], i, {
                    stripVersionSuffix: identifier.stripVersionSuffix,
                });
            }
        }

        if (this.#backend.synonymIndex) {
            const terms = await this.#readArray(
                this.#backend.synonymIndex.termPath,
                signal
            );
            const columnIndices = await this.#readArray(
                this.#backend.synonymIndex.columnIndexPath,
                signal
            );

            if (terms.length !== columnIndices.length) {
                throw new Error(
                    "Synonym index arrays termPath and columnIndexPath have different lengths."
                );
            }

            for (let i = 0; i < terms.length; i++) {
                const columnIndex = Number(columnIndices[i]);
                if (!Number.isInteger(columnIndex)) {
                    continue;
                }
                if (columnIndex < 0 || columnIndex >= columnIds.length) {
                    continue;
                }
                if (this.#isExcludedColumn(columnIds[columnIndex])) {
                    continue;
                }
                addTerm(lookup, terms[i], columnIndex);
            }
        }

        return lookup;
    }

    /**
     * @param {string} path
     * @param {AbortSignal} [signal]
     * @returns {Promise<any[]>}
     */
    async #readArray(path, signal) {
        const location = zarrRoot(this.#store).resolve(normalizePath(path));
        const array = await zarrOpen(location, { kind: "array" });
        const chunk =
            /** @type {{ data: any; shape: number[]; stride: number[] }} */ (
                await zarrGet(
                    array,
                    [zarrSlice(null)],
                    signal ? { opts: { signal } } : undefined
                )
            );
        return flatten1dChunk(chunk);
    }

    /**
     * @param {string} path
     * @param {AbortSignal} [signal]
     * @returns {Promise<string[]>}
     */
    async #readStringArray(path, signal) {
        const values = await this.#readArray(path, signal);
        return values.map((value) => String(value));
    }

    #requireMatrixLayout() {
        if (this.#backend.layout === "matrix") {
            return;
        }
        throw new Error(
            'Only Zarr metadata sources with layout "matrix" are supported in MVP.'
        );
    }

    /**
     * @param {string} columnId
     * @returns {boolean}
     */
    #isExcludedColumn(columnId) {
        return this.#excludedColumns.has(columnId);
    }
}
