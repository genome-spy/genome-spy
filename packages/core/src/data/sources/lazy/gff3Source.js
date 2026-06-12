import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import TabixSource from "./tabixSource.js";

/**
 * @extends {TabixSource<import("gff-nostream").GFF3Feature, import("gff-nostream")>}
 */
export default class Gff3Source extends TabixSource {
    get label() {
        return "gff3Source";
    }

    /**
     * @param {string} header
     * @returns {Promise<import("gff-nostream")>}
     */
    async _createParser(header) {
        return await import("gff-nostream");
    }

    /**
     * @param {string[]} lines
     * @param {import("gff-nostream")} gff
     */
    _parseFeatures(lines, gff) {
        const features = gff.parseStringSync(lines.join("\n"));

        return features;
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").Gff3Data}
 */
function isGff3Source(params) {
    return params?.type == "gff3";
}

registerBuiltInLazyDataSource(isGff3Source, Gff3Source);
