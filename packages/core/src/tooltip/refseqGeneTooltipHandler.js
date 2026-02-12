import { debounce } from "../utils/debounce.js";
import { html } from "lit";

/*
 * https://www.ncbi.nlm.nih.gov/books/NBK25500/
 *
 * TODO: Implement tool & email parameters: https://www.ncbi.nlm.nih.gov/books/NBK25497/
 */

const symbolSummaryCache = new Map();

const defaultParams = {
    Organism: "Homo sapiens",
};

/**
 * @type {import("./tooltipHandler.js").TooltipHandler}
 */
export default async function refseqGeneTooltipHandler(
    datum,
    mark,
    params = {}
) {
    const symbol = datum.symbol;

    /** @type {Record<string, string>} */
    const term = {
        ...defaultParams,
        GENE: symbol,
    };

    for (const [key, value] of Object.entries(params)) {
        if (typeof value === "string") {
            term[key] = value;
        }
    }

    let summary =
        symbolSummaryCache.get(symbol) ??
        (await debouncedFetchGeneSummary(term));

    if (summary) {
        symbolSummaryCache.set(symbol, summary);
        return html`
            <div class="title">
                <strong>${summary.name}</strong>
                ${summary.description}
            </div>
            <p class="summary">${summary.summary}</p>
            <p class="source">Source: NCBI RefSeq Gene</p>
        `;
    } else {
        return null;
    }
}

/**
 * @param {Record<string, string>} term
 */
async function fetchGeneSummary(term) {
    /** @type {RequestInit} */
    const opts = { mode: "cors" };

    const url = new URL(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    );
    url.search = new URLSearchParams({
        db: "gene",
        term: termToQuery(term),
        sort: "relevance",
        retmax: "1",
        retmode: "json",
    }).toString();

    const searchResult = await fetch(url.toString(), opts).then((res) =>
        res.json()
    );

    // TODO: Handle failed searchs
    const id = searchResult.esearchresult.idlist[0];

    if (id) {
        const summaryUrl = new URL(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
        );
        summaryUrl.search = new URLSearchParams({
            db: "gene",
            id: id,
            retmode: "json",
        }).toString();

        const summaryResult = await fetch(summaryUrl.toString(), opts).then(
            (res) => res.json()
        );

        const summary = summaryResult.result[id];
        return summary;
    } else {
        return null;
    }
}

const debounced = debounce(fetchGeneSummary, 500);

/**
 * @param {Record<string, string>} term
 */
function debouncedFetchGeneSummary(term) {
    return debounced(term);
}

/**
 * @param {Record<string, string>} term
 */
function termToQuery(term) {
    return (
        Object.entries(term)
            .filter(([_, value]) => value && value.length > 0)
            // TODO: Escape
            .map(([key, value]) => `("${value}"[${key}])`)
            .join(" AND ")
    );
}
