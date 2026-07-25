import TabixSource from "./tabixSource.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import { createVcfParser, parseVcfLines } from "../../formats/vcfParser.js";

/**
 * @extends {TabixSource<import("../../formats/vcfTypes.js").ParsedVariant, import("@gmod/vcf").default>}
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
        return await createVcfParser(header);
    }

    /**
     * @param {string[]} lines
     * @param {import("@gmod/vcf").default} parser
     */
    _parseFeatures(lines, parser) {
        return parseVcfLines(lines, parser);
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
