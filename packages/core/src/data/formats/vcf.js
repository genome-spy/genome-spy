import { formats as vegaFormats } from "vega-loader";
import { createVcfParser, materializeVcfVariant } from "./vcfParser.js";

/**
 * Iterates over lines without first allocating an array containing the whole
 * file.
 *
 * @param {string} text
 */
function* iterateLines(text) {
    let lineNumber = 1;
    let start = 0;

    while (start <= text.length) {
        const newline = text.indexOf("\n", start);
        const end = newline == -1 ? text.length : newline;
        const carriageReturn = end > start && text.charCodeAt(end - 1) == 13;

        yield {
            line: text.slice(start, carriageReturn ? end - 1 : end),
            lineNumber,
        };

        if (newline == -1) {
            break;
        }

        start = newline + 1;
        lineNumber++;
    }
}

/**
 * Loads an entire VCF file into memory and parses its variant records.
 *
 * @param {string} data VCF text.
 * @returns {Promise<import("./vcfTypes.js").ParsedVariant[]>}
 */
export default async function vcf(data) {
    /** @type {string[]} */
    const headerLines = [];
    /** @type {import("./vcfTypes.js").ParsedVariant[]} */
    const variants = [];
    /** @type {import("@gmod/vcf").default | undefined} */
    let parser;

    for (const { line, lineNumber } of iterateLines(data)) {
        if (!line) {
            continue;
        }

        if (!parser && line.startsWith("#")) {
            headerLines.push(line);
            continue;
        }

        parser ??= await createVcfParser(headerLines.join("\n"));

        try {
            variants.push(materializeVcfVariant(parser.parseLine(line)));
        } catch (error) {
            throw new Error(`Cannot parse VCF line ${lineNumber}`, {
                cause: error,
            });
        }
    }

    // A header-only VCF never creates a parser in the loop; validate it here.
    if (!parser) {
        await createVcfParser(headerLines.join("\n"));
    }

    return variants;
}

vegaFormats("vcf", vcf);
