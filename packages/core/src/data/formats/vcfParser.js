/**
 * @param {string} header
 * @returns {Promise<import("@gmod/vcf").default>}
 */
export async function createVcfParser(header) {
    const VCFParser = (await import("@gmod/vcf")).default;
    // @ts-ignore - The constructor type does not accept its documented options.
    return new VCFParser({ header });
}

/**
 * Materializes the lazy sample accessor so records can pass through the
 * dataflow as ordinary objects.
 *
 * @param {import("@gmod/vcf").Variant} parsed
 * @returns {import("./vcfTypes.js").ParsedVariant}
 */
export function materializeVcfVariant(parsed) {
    delete parsed.GENOTYPES;
    // @ts-ignore - Replace the method with its materialized result.
    parsed.SAMPLES = parsed.SAMPLES();

    return /** @type {import("./vcfTypes.js").ParsedVariant} */ (
        /** @type {object} */ (parsed)
    );
}

/**
 * @param {string[]} lines
 * @param {import("@gmod/vcf").default} parser
 * @returns {import("./vcfTypes.js").ParsedVariant[]}
 */
export function parseVcfLines(lines, parser) {
    return lines.map((line) => materializeVcfVariant(parser.parseLine(line)));
}
