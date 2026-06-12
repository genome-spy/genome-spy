import TabixSource from "./tabixSource.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";

/**
 * @extends {TabixSource<import("./vcfTypes.js").ParsedVariant, import("@gmod/vcf").default>}
 */
export default class VcfSource extends TabixSource {
    get label() {
        return "vcfSource";
    }

    /**
     * @param {string} header
     * @returns {Promise<import("@gmod/vcf").default>}
     */
    async _createParser(header) {
        const VCFParser = (await import("@gmod/vcf")).default;
        // @ts-ignore - There's something wrong with the type definition
        return new VCFParser({ header });
    }

    /**
     * @param {string[]} lines
     * @param {import("@gmod/vcf").default} parser
     */
    _parseFeatures(lines, parser) {
        return lines.map((line) => {
            const parsed = parser.parseLine(line);
            delete parsed.GENOTYPES;
            // @ts-ignore
            parsed.SAMPLES = parsed.SAMPLES();

            return /** @type {import("./vcfTypes.js").ParsedVariant} */ (
                /** @type {object} */ (parsed)
            );
        });
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").VcfData}
 */
function isVcfSource(params) {
    return params?.type == "vcf";
}

registerBuiltInLazyDataSource(isVcfSource, VcfSource);
