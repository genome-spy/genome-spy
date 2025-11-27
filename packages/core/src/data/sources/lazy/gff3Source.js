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
        const features = this.#gff?.parseArraySync(lines);

        return features;
    }
}
