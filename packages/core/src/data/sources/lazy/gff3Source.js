import { registerBuiltInLazyDataSource } from "../lazyDataSourceRegistry.js";
import TabixSource from "./tabixSource.js";

/**
 * @extends {TabixSource<import("gff-nostream").GFF3Feature>}
 */
export default class Gff3Source extends TabixSource {
    /** @type {import("gff-nostream")} */
    #gff;

    get label() {
        return "gff3Source";
    }

    /**
     * @param {string} header
     */
    async _handleHeader(header) {
        this.#gff = await import("gff-nostream");
    }

    /**
     * @param {string[]} lines
     */
    _parseFeatures(lines) {
        const features = this.#gff?.parseStringSync(lines.join("\n"));

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
