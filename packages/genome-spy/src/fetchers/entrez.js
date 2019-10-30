/*
 * https://www.ncbi.nlm.nih.gov/books/NBK25500/
 * 
 * TODO: Implement tool & email parameters: https://www.ncbi.nlm.nih.gov/books/NBK25497/
 * TODO: Implement throttling, max three request per second
 */

// TODO: Replace with an LRU-cache
const symbolSummaryCache = new Map();

export async function fetchGeneSummary(symbol) {
    // TODO: Add more search terms to ensure that we really find genes specific to the current genome

    if (symbolSummaryCache.has(symbol)) {
        return symbolSummaryCache.get(symbol);
    }

    console.log("Searching: " + symbol);

    const opts = { mode: "cors" };

    const searchResult = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=${symbol}[GENE]&sort=relevance&retmode=json`, opts)
        .then(res => res.json())

    // TODO: Handle failed searchs
    const id = searchResult.esearchresult.idlist[0];

    if (id) {
        const summaryResult = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${id}&retmode=json`, opts)
            .then(res => res.json())

        const summary = summaryResult.result[id];
        symbolSummaryCache.set(symbol, summary);
        return summary;

    } else {
        return null;
    }
}