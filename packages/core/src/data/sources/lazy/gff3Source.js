import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import TabixSource from "./tabixSource.js";
import { normalizeGenomicStrand } from "../../formats/genomicStrand.js";

/**
 * @extends {TabixSource<import("./gff3Types.js").Gff3FeatureDatum, typeof import("gff-nostream")>}
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
     * @param {typeof import("gff-nostream")} gff
     */
    _parseFeatures(lines, gff) {
        return adaptGff3Features(gff.parseLines(lines));
    }
}

/**
 * Adapts parser-native GFF3 features recursively while preserving shared
 * object identity for legitimate multi-parent relationships.
 *
 * @param {import("gff-nostream").GffFeature[]} features
 * @returns {import("./gff3Types.js").Gff3FeatureDatum[]}
 */
export function adaptGff3Features(features) {
    /** @type {WeakMap<import("gff-nostream").GffFeature, import("./gff3Types.js").Gff3FeatureDatum>} */
    const adapted = new WeakMap();
    return adaptFeatureList(features, adapted);
}

const builtInFields = new Set([
    "refName",
    "source",
    "type",
    "start",
    "end",
    "score",
    "strand",
    "phase",
    "subfeatures",
]);

/**
 * @param {import("gff-nostream").GffFeature[]} features
 * @param {WeakMap<import("gff-nostream").GffFeature, import("./gff3Types.js").Gff3FeatureDatum>} adapted
 */
function adaptFeatureList(features, adapted) {
    /** @type {import("./gff3Types.js").Gff3FeatureDatum[]} */
    const result = [];
    const seen = new Set();

    for (const feature of features) {
        if (!seen.has(feature)) {
            seen.add(feature);
            result.push(adaptGff3Feature(feature, adapted));
        }
    }

    return result;
}

/**
 * @param {import("gff-nostream").GffFeature} feature
 * @param {WeakMap<import("gff-nostream").GffFeature, import("./gff3Types.js").Gff3FeatureDatum>} adapted
 * @returns {import("./gff3Types.js").Gff3FeatureDatum}
 */
function adaptGff3Feature(feature, adapted) {
    const cached = adapted.get(feature);
    if (cached) {
        return cached;
    }

    /** @type {import("./gff3Types.js").Gff3FeatureDatum} */
    const result = {
        chrom: feature.refName,
        source: feature.source,
        type: feature.type,
        start: feature.start,
        end: feature.end,
        score: feature.score,
        strand: normalizeGenomicStrand(feature.strand),
        phase: feature.phase,
        subfeatures: [],
    };
    adapted.set(feature, result);

    let chromAttribute;
    let hasChromAttribute = false;
    for (const [key, value] of Object.entries(feature)) {
        if (key == "chrom") {
            chromAttribute = value;
            hasChromAttribute = true;
        } else if (!builtInFields.has(key)) {
            result[key] = value;
        }
    }

    if (hasChromAttribute) {
        let suffix = 2;
        while (`chrom${suffix}` in result) {
            suffix++;
        }
        result[`chrom${suffix}`] = chromAttribute;
    }

    result.subfeatures = adaptFeatureList(feature.subfeatures, adapted);
    return result;
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").Gff3Data}
 */
function isGff3Source(params) {
    return params?.type == "gff3";
}

registerBuiltInLazyDataSource(isGff3Source, Gff3Source);
