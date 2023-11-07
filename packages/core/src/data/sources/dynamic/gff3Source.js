import gff from "@gmod/gff";
import TabixSource from "./tabixSource.js";

/**
 * @extends {TabixSource<import("@gmod/gff").GFF3Feature>}
 */
export default class Gff3Source extends TabixSource {
    /**
     * @param {string[]} lines
     */
    _parseFeatures(lines) {
        // eslint-disable-next-line no-sync
        const features = gff.parseStringSync(lines.join("\n"), {
            parseSequences: false,
        });

        return features;
    }
}
