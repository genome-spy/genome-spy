import { tsvParseRows } from "d3-dsv";
import { loader } from "vega-loader";
import ChromMapper from "./chromMapper";
import { formatRange } from "./locusFormat";

const defaultBaseUrl = "https://genomespy.app/data/genomes/";

/**
 * @typedef {import("../spec/genome").GenomeConfig} GenomeConfig
 */

export default class Genome {
    /**
     * @param {GenomeConfig} config
     */
    constructor(config) {
        this.config = config;

        if (!this.config.contigs && typeof this.config.name !== "string") {
            throw new Error(
                "No name has been defined for the genome assembly!"
            );
        }
    }

    get name() {
        return this.config.name;
    }

    /**
     *
     * @param {import("../genomeSpy").default} genomeSpy
     */
    async initialize(genomeSpy) {
        if (this.config.baseUrl) {
            this.baseUrl = /^http(s)?/.test(this.config.baseUrl)
                ? this.config.baseUrl
                : genomeSpy.config.baseUrl + "/" + this.config.baseUrl;
        } else {
            this.baseUrl = defaultBaseUrl;
        }

        if (this.config.contigs) {
            // TODO: Sanity check for contig config
            this.chromSizes = this.config.contigs;
        } else {
            try {
                this.chromSizes = parseChromSizes(
                    await loader({ baseURL: this.baseUrl }).load(
                        `${this.config.name}/${this.name}.chrom.sizes`
                    )
                );
            } catch (e) {
                throw new Error(`Could not load chrom sizes: ${e.message}`);
            }
        }
        this.chromMapper = new ChromMapper(this.chromSizes);

        // TODO: Support multiple genomes
        genomeSpy.registerNamedDataProvider(name => {
            if (name == "chromSizes") {
                return this.chromMapper.getChromosomes();
            }
        });
    }

    /**
     * Returns a UCSC Genome Browser -style string presentation of the interval.
     * However, the interval may span multiple chromosomes, which is incompatible
     * with UCSC.
     *
     * The inteval is shown as one-based closed-open range.
     * See https://genome.ucsc.edu/FAQ/FAQtracks#tracks1
     *
     * @param {number[]} interval
     * @returns {string}
     */
    formatInterval(interval) {
        // Round the lower end
        const begin = this.chromMapper.toChromosomal(interval[0] + 0.5);
        // Because of the open upper bound, one is first subtracted from the upper bound and later added back.
        const end = this.chromMapper.toChromosomal(interval[1] - 1);
        end.pos += 1;

        return formatRange(begin, end);
    }

    /**
     *
     * @param {string} str
     * @returns {[number, number]}
     */
    parseInterval(str) {
        // TODO: consider changing [0-9XY] to support other species besides humans
        const matches = str.match(
            /^(chr[0-9A-Z]+):([0-9,]+)-(?:(chr[0-9A-Z]+):)?([0-9,]+)$/
        );

        if (matches) {
            const startChr = matches[1];
            const endChr = matches[3] || startChr;

            const startIndex = parseInt(matches[2].replace(/,/g, ""));
            const endIndex = parseInt(matches[4].replace(/,/g, ""));

            return [
                this.chromMapper.toContinuous(startChr, startIndex - 1),
                this.chromMapper.toContinuous(endChr, endIndex)
            ];
        }
    }
}

/**
 *
 * @param {string} chromSizesData
 */
export function parseChromSizes(chromSizesData) {
    // TODO: Support other organisms too
    return tsvParseRows(chromSizesData)
        .filter(row => /^chr[0-9A-Z]+$/.test(row[0]))
        .map(([name, size]) => ({ name, size: parseInt(size) }));
}

/**
 * Parses a UCSC chromosome band table
 *
 * See: https://genome.ucsc.edu/goldenpath/gbdDescriptionsOld.html#ChromosomeBand
 *
 * @param {string} cytobandData cytoband table
 * @returns an array of cytoband objects
 */
export function parseUcscCytobands(cytobandData) {
    return (
        tsvParseRows(cytobandData)
            // TODO: Support other organisms too
            .filter(b => /^chr[0-9A-Z]+$/.test(b[0]))
            .map(row => ({
                chrom: row[0],
                chromStart: +row[1],
                chromEnd: +row[2],
                name: row[3],
                gieStain: row[4]
            }))
    );
}

/**
 * Builds a chromosome-sizes object from a cytoband array
 *
 * @param {*} cytobands
 */
export function cytobandsToChromSizes(cytobands) {
    const chromSizes = {};

    cytobands.forEach(band => {
        const chrom = band.chrom;
        chromSizes[chrom] = Math.max(
            chromSizes.hasOwnProperty(chrom) ? chromSizes[chrom] : 0,
            band.chromEnd + 1
        );
    });

    return chromSizes;
}
