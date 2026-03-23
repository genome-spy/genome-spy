import TabixSource from "./tabixSource.js";
import { registerBuiltInLazyDataSource } from "../lazyDataSourceRegistry.js";

/**
 * @extends {TabixSource<import("./vcfTypes.js").ParsedVariant>}
 */
export default class VcfSource extends TabixSource {
    /** @type {import("@gmod/vcf").default} */
    #tbiVCFParser;

    get label() {
        return "vcfSource";
    }

    /**
     * @param {string} header
     */
    async _handleHeader(header) {
        const VCFParser = (await import("@gmod/vcf")).default;
        // @ts-ignore - There's something wrong with the type definition
        this.#tbiVCFParser = new VCFParser({ header });
    }

    /**
     * @param {string[]} lines
     */
    _parseFeatures(lines) {
        return lines.map((line) => {
            const parsed = this.#tbiVCFParser.parseLine(line);
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
