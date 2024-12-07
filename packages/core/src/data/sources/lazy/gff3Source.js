import TabixSource from "./tabixSource.js";

/**
 * @extends {TabixSource<import("@gmod/gff").GFF3Feature>}
 */
export default class Gff3Source extends TabixSource {
    /** @type {import("@gmod/gff").default} */
    #gff;

    get label() {
        return "gff3Source";
    }

    /**
     * @param {string} header
     */
    async _handleHeader(header) {
        this.#gff = (await import("@gmod/gff")).default;
    }

    /**
     * @param {string[]} lines
     */
    _parseFeatures(lines) {
        // Hmm. It's silly that we have to first collect individual lines and then join them.
        // eslint-disable-next-line no-sync
        const features = this.#gff?.parseStringSync(lines.join("\n"), {
            parseSequences: false,
        });

        return features;
    }
}
