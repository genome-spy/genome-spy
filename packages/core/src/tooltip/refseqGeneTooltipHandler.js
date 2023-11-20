import { debounce } from "../utils/debounce.js";
import { html } from "lit-html";

/*
 * https://www.ncbi.nlm.nih.gov/books/NBK25500/
 *
 * TODO: Implement tool & email parameters: https://www.ncbi.nlm.nih.gov/books/NBK25497/
 */

// TODO: Replace with an LRU-cache
const symbolSummaryCache = new Map();

/**
 * @type {import("./tooltipHandler.js").TooltipHandler}
 */
export default async function refseqGeneTooltipHandler(datum, mark, params) {
    const symbol = datum.symbol;

    let summary =
        symbolSummaryCache.get(symbol) ??
        (await debouncedFetchGeneSummary(datum.symbol));

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
 * @param {string} symbol
 */
async function fetchGeneSummary(symbol) {
    // TODO: Add more search terms to ensure that we really find genes specific to the current genome

    console.log("Searching: " + symbol);

    /** @type {RequestInit} */
    const opts = { mode: "cors" };

    const searchResult = await fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=${symbol}[GENE]&sort=relevance&retmode=json`,
        opts
    ).then((res) => res.json());

    // TODO: Handle failed searchs
    const id = searchResult.esearchresult.idlist[0];

    if (id) {
        const summaryResult = await fetch(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${id}&retmode=json`,
            opts
        ).then((res) => res.json());

        const summary = summaryResult.result[id];
        return summary;
    } else {
        return null;
    }
}

const debounced = debounce(fetchGeneSummary, 500);

/**
 *
 * @param {string} symbol
 */
function debouncedFetchGeneSummary(symbol) {
    return debounced(symbol);
}
