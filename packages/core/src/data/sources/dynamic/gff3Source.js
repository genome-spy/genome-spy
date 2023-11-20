import TabixSource from "./tabixSource.js";

/**
 * @extends {TabixSource<import("@gmod/gff").GFF3Feature>}
 */
export default class Gff3Source extends TabixSource {
    /** @type {import("@gmod/gff").default} */
    #gff;

    /**
     * @param {import("../../../spec/data").TabixData} params
     * @param {import("../../../view/view").default} view
     */
    constructor(params, view) {
        super(params, view);

        import("@gmod/gff").then((gff) => {
            // TODO: Fix race condition
            this.#gff = gff.default;
        });
    }

    /**
     * @param {string[]} lines
     */
    _parseFeatures(lines) {
        // eslint-disable-next-line no-sync
        const features = this.#gff?.parseStringSync(lines.join("\n"), {
            parseSequences: false,
        });

        return features;
    }
}
