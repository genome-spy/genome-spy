import TabixSource from "./tabixSource.js";

/**
 * @extends {TabixSource<import("@gmod/gff").GFF3Feature>}
 */
export default class Gff3Source extends TabixSource {
    /** @type {import("@gmod/gff").default} */
    #gff;

    /**
     * @param {import("../../../spec/data.js").TabixData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        super(params, view);

        import("@gmod/gff").then((gff) => {
            // TODO: Fix race condition
            this.#gff = gff.default;
        });
    }

    get label() {
        return "gff3Source";
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
