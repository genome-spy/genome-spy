import { read } from "vega-loader";
import {
    getFormat,
    makeWrapper,
    responseType,
} from "@genome-spy/core/data/sources/dataUtils.js";
import { concatUrl } from "@genome-spy/core/utils/url.js";
import { validateMetadata } from "../uploadMetadataDialog.js";
import { wrangleMetadata } from "../metadataUtils.js";

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 * @typedef {import("@genome-spy/app/spec/sampleView.js").DataBackendDef} DataBackendDef
 */

export default class DataMetadataSourceAdapter {
    /** @type {MetadataSourceDef} */
    #source;

    /** @type {DataBackendDef} */
    #backend;

    /** @type {string | undefined} */
    #baseUrl;

    /** @type {Promise<Record<string, any>[]> | undefined} */
    #rowsPromise;

    /**
     * @param {MetadataSourceDef} source
     * @param {{ baseUrl?: string }} [options]
     */
    constructor(source, options = {}) {
        this.#source = source;
        this.#backend =
            /** @type {DataBackendDef} */
            (source.backend);
        this.#baseUrl = options.baseUrl;
    }

    /**
     * @param {AbortSignal} [signal]
     * @returns {Promise<{ id: string }[]>}
     */
    async listColumns(signal) {
        const rows = await this.#loadRows(signal);
        const sampleIdField = this.#backend.sampleIdField ?? "sample";

        /** @type {Set<string>} */
        const columns = new Set();
        for (const row of rows) {
            for (const key of Object.keys(row)) {
                if (key === sampleIdField) {
                    continue;
                }
                columns.add(key);
            }
        }

        return Array.from(columns)
            .sort()
            .map((id) => ({ id }));
    }

    /**
     * @param {string[]} queries
     * @param {AbortSignal} [signal]
     * @returns {Promise<{ columnIds: string[]; missing: string[] }>}
     */
    async resolveColumns(queries, signal) {
        const columns = await this.listColumns(signal);
        const available = new Set(columns.map((column) => column.id));

        /** @type {string[]} */
        const columnIds = [];
        /** @type {Set<string>} */
        const missing = new Set();

        for (const query of queries) {
            if (available.has(query)) {
                if (!columnIds.includes(query)) {
                    columnIds.push(query);
                }
            } else {
                missing.add(query);
            }
        }

        return { columnIds, missing: Array.from(missing) };
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
        const rows = await this.#loadRows(signal);
        const sampleIdField = this.#backend.sampleIdField ?? "sample";
        const sampleIdSet = new Set(request.sampleIds);

        /** @type {Record<string, any>[]} */
        const selectedRows = [];
        for (const row of rows) {
            const sampleId = String(row[sampleIdField] ?? "");
            if (!sampleIdSet.has(sampleId)) {
                continue;
            }

            /** @type {Record<string, any>} */
            const selected = { sample: sampleId };
            for (const columnId of request.columnIds) {
                selected[columnId] = row[columnId];
            }

            selectedRows.push(selected);
        }

        if (selectedRows.length === 0) {
            throw new Error(
                "Metadata source rows do not match any sample ids in the current view."
            );
        }

        const validation = validateMetadata(request.sampleIds, selectedRows);
        if ("error" in validation) {
            const firstError = validation.error[0];
            throw new Error(
                "Invalid metadata source payload: " + String(firstError.message)
            );
        }

        if (validation.statistics.samplesInBoth.size === 0) {
            throw new Error(
                "Metadata source rows do not match any sample ids in the current view."
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
            selectedRows,
            attributeDefs,
            this.#source.attributeGroupSeparator,
            groupPath
        );

        if (request.replace !== undefined) {
            setMetadata.replace = request.replace;
        }

        return setMetadata;
    }

    /**
     * @param {AbortSignal} [signal]
     * @returns {Promise<Record<string, any>[]>}
     */
    async #loadRows(signal) {
        if (!this.#rowsPromise) {
            this.#rowsPromise = this.#loadRowsUncached(signal).catch(
                (error) => {
                    this.#rowsPromise = undefined;
                    throw error;
                }
            );
        }
        return this.#rowsPromise;
    }

    /**
     * @param {AbortSignal} [signal]
     * @returns {Promise<Record<string, any>[]>}
     */
    async #loadRowsUncached(signal) {
        const data = this.#backend.data;

        if ("url" in data) {
            return this.#loadRowsFromUrlData(data, signal);
        }

        if ("values" in data) {
            return this.#loadRowsFromInlineData(data);
        }

        throw new Error(
            "Metadata source data backend supports only UrlData and InlineData."
        );
    }

    /**
     * @param {import("@genome-spy/core/spec/data.js").UrlData} data
     * @param {AbortSignal} [signal]
     * @returns {Promise<Record<string, any>[]>}
     */
    async #loadRowsFromUrlData(data, signal) {
        if (typeof data.url !== "string") {
            throw new Error(
                "Metadata source UrlData currently supports only string URLs."
            );
        }

        const url = concatUrl(this.#baseUrl, data.url);
        const format = getFormat(data, url);
        const type = responseType(format.type);

        let response;
        try {
            response = await fetch(url, { signal });
        } catch (error) {
            throw new Error("Could not load metadata source: " + error.message);
        }

        if (!response.ok) {
            throw new Error(
                "Could not load metadata source: " +
                    response.status +
                    " " +
                    response.statusText
            );
        }

        /** @type {any} */
        let content;
        // @ts-ignore
        if (typeof response[type] === "function") {
            // @ts-ignore
            content = await response[type]();
        } else {
            content = await response.text();
        }

        /** @type {Record<string, any>[]} */
        const parsed = read(content, format);
        return parsed;
    }

    /**
     * @param {import("@genome-spy/core/spec/data.js").InlineData} data
     * @returns {Promise<Record<string, any>[]>}
     */
    async #loadRowsFromInlineData(data) {
        const values = data.values;

        /** @type {Record<string, any>[]} */
        let rows = [];

        if (Array.isArray(values)) {
            if (values.length > 0) {
                const wrap = makeWrapper(values[0]);
                rows = values.map(
                    (value) =>
                        /** @type {Record<string, any>} */
                        (wrap(value))
                );
            }
        } else if (typeof values === "object") {
            rows = [
                /** @type {Record<string, any>} */
                (values),
            ];
        } else if (typeof values === "string") {
            rows =
                /** @type {Record<string, any>[]} */
                (read(values, getFormat(data)));
        } else {
            throw new Error(
                "Inline metadata source values must be an array, object, or a string."
            );
        }

        return rows;
    }
}
