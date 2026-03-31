import { read } from "vega-loader";
import { withoutExprRef } from "../../../paramRuntime/paramUtils.js";
import { toVegaLoaderFormat } from "../dataUtils.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import TabixSource from "./tabixSource.js";

/**
 * Extract a TSV header from a tabix file header.
 *
 * Tabix headers commonly end with a commented column line such as
 * `#chrom\tstart\tend\tvalue`.
 *
 * @param {string} header
 * @returns {string[] | undefined}
 */
export function extractTabixTsvColumns(header) {
    const lines = header.split(/\r?\n/);

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trimEnd().replace(/\r$/, "");

        if (!line || line.startsWith("##")) {
            continue;
        }

        if (!line.startsWith("#")) {
            continue;
        }

        const columns = line.slice(1).split("\t");

        if (columns.length > 1) {
            return columns;
        }
    }
}

/**
 * Extract a TSV header from the first line of a plain tabix file prefix.
 *
 * This is used when the file does not have a commented header line, but the
 * first physical line still contains column names.
 *
 * @param {string} text
 * @returns {string[] | undefined}
 */
export function extractTabixTsvColumnsFromFirstLine(text) {
    const lines = text.split(/\r?\n/);

    const firstLine = lines.find((line) => {
        const trimmed = line.trimStart();
        return trimmed !== "" && !trimmed.startsWith("#");
    });

    if (!firstLine) {
        return;
    }

    const columns = firstLine.trimEnd().replace(/\r$/, "").split("\t");
    if (columns.length > 1) {
        return columns;
    }
}

/**
 * Parse tabix TSV records into plain objects.
 *
 * @param {string[]} lines
 * @param {string[]} columns
 * @param {import("../../../spec/data.js").Parse | null | undefined} [parse]
 */
export function parseTabixTsvLines(lines, columns, parse) {
    if (lines.length == 0) {
        return [];
    }

    /** @type {any} */
    const format = {
        type: "tsv",
        columns,
        parse: parse ?? "auto",
    };

    /** @type {Record<string, any>[]} */
    const data = read(lines.join("\n"), toVegaLoaderFormat(format));

    const chromField = columns[0];
    /** @type {unknown} */
    let prev = null;
    let stringChrom = "";

    for (const datum of data) {
        const value = datum[chromField];
        if (value != prev) {
            prev = value;
            stringChrom = String(value);
        }
        datum[chromField] = stringChrom;
    }

    return data;
}

/**
 * @extends {TabixSource<Record<string, any>>}
 */
export default class TabixTsvSource extends TabixSource {
    /** @type {string[] | undefined} */
    #columns;

    get label() {
        return "tabixSource";
    }

    /**
     * @param {string} header
     */
    async _handleHeader(header) {
        const params =
            /** @type {import("../../../spec/data.js").TabixTsvData} */ (
                this.params
            );
        const columns = withoutExprRef(params.columns);
        this.#columns = columns ?? extractTabixTsvColumns(header);

        if (!this.#columns?.length) {
            this.#columns = extractTabixTsvColumnsFromFirstLine(
                await this._readFilePrefix()
            );
        }

        if (!this.#columns?.length) {
            throw new Error(
                "No columns available for Tabix TSV source. Provide data.lazy.columns or a tabix header line such as #chrom\\tstart\\tend, or a plain first row such as chrom\\tstart\\tend."
            );
        }
    }

    /**
     * @param {string[]} lines
     */
    _parseFeatures(lines) {
        const params =
            /** @type {import("../../../spec/data.js").TabixTsvData} */ (
                this.params
            );
        return parseTabixTsvLines(
            lines,
            this.#columns ?? [],
            withoutExprRef(params.parse)
        );
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").TabixTsvData}
 */
function isTabixTsvSource(params) {
    return params?.type == "tabix";
}

registerBuiltInLazyDataSource(isTabixTsvSource, TabixTsvSource);
