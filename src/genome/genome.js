import { format as d3format } from 'd3-format';
import { tsvParseRows } from 'd3-dsv';
import { chromMapper } from "./chromMapper";
import CoordinateSystem from '../coordinateSystem';
import Interval from '../utils/interval';

const defaultBaseUrl = "https://genomespy.app/data/genomes/";
/**
 * @typedef {import("../spec/genome").GenomeConfig} GenomeConfig
 */

export default class Genome extends CoordinateSystem {
    /**
     * @param {GenomeConfig} config
     */
    constructor(config) {
        super();
        this.config = config;

        if (typeof this.config.name !== "string") {
            throw new Error("No name has been defined for the genome assembly!");
        }

        this.numberFormat = d3format(",d");
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
            this.baseUrl = /^http(s)?/.test(this.config.baseUrl) ?
                this.config.baseUrl :
                genomeSpy.config.baseUrl + "/" + this.config.baseUrl;
        } else {
            this.baseUrl = defaultBaseUrl;
        }
        
        const url = `${this.baseUrl}/${this.config.name}/${this.name}.chrom.sizes`;
        this.chromSizes = await fetch(url, { credentials: 'same-origin' })
            .then(res => {
                if (res.ok) {
                    return res.text();
                }
                throw new Error(`Could not load chrom sizes: ${url} \nReason: ${res.status} ${res.statusText}`);
            })
            .then(parseChromSizes);

        this.chromMapper = chromMapper(this.chromSizes);

        genomeSpy.accessorFactory.register(encoding => {
            if (encoding.chrom && encoding.pos) {
                const offset = typeof encoding.offset == "number" ? encoding.offset : 0;
                const chrom = encoding.chrom;
                const pos = encoding.pos;

                /** @type {import("../encoder/accessor").Accessor} */
                const accessor = d => this.chromMapper.toContinuous(d[chrom], d[pos]) + offset;
                accessor.constant = false;
                accessor.fields = [chrom, pos];
                return accessor;
            }
        });

        genomeSpy.datasets.set("chromSizes", [...this.chromSizes.entries()].map(e => ({ chrom: e[0], size: e[1] })));
    }

    
    /**
     * Returns a UCSC Genome Browser -style string presentation of the interval.
     * However, the interval may span multiple chromosomes, which is incompatible
     * with UCSC.
     * 
     * The inteval is shown as one-based closed-open range.
     * See https://genome.ucsc.edu/FAQ/FAQtracks#tracks1
     * 
     * @param {import("../utils/interval").default} interval 
     * @returns {string}
     */
    formatInterval(interval) {
        // Round the lower end
        const begin = this.chromMapper.toChromosomal(interval.lower + 0.5);
        // Because of the open upper bound, one is first subtracted from the upper bound and later added back.
        const end = this.chromMapper.toChromosomal(interval.upper - 1);

        return begin.chromosome.name + ":" +
            this.numberFormat(Math.floor(begin.locus + 1)) + "-" +
            (begin.chromosome != end.chromosome ? (end.chromosome.name + ":") : "") +
            this.numberFormat(Math.ceil(end.locus + 1));
    }

    /**
     * 
     * @param {string} str 
     * @returns {void | import("./utils/interval").default}
     */
    parseInterval(str) {
        // TODO: consider changing [0-9XY] to support other species besides humans
        const matches = str.match(/^(chr[0-9XY]+):([0-9,]+)-(?:(chr[0-9XY]+):)?([0-9,]+)$/);

        if (matches) {
            const startChr = matches[1];
            const endChr = matches[3] || startChr;

            const startIndex = parseInt(matches[2].replace(/,/g, ""));
            const endIndex = parseInt(matches[4].replace(/,/g, ""));

            return new Interval(
                this.chromMapper.toContinuous(startChr, startIndex - 1),
                this.chromMapper.toContinuous(endChr, endIndex)
            );

        } else {
            return null;
        }

    }


    /**
     * If the coordinate system has a hard extent, return it. Otherwise returns undefined.
     * 
     * @returns {void | import("../utils/interval").default}
     */
    getExtent() {
        return this.chromMapper.extent();
    }
}

export function parseChromSizes(chromSizesData) {
    // TODO: Support other organisms too
    return new Map(tsvParseRows(chromSizesData)
        .filter(row => /^chr[0-9XY]{1,2}$/.test(row[0]))
        .map(([chrom, size]) => [chrom, parseInt(size)]));
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
    return tsvParseRows(cytobandData)
        // TODO: Support other organisms too
        .filter(b => /^chr[0-9XY]{1,2}$/.test(b[0]))
        .map(row => ({
            chrom: row[0],
            chromStart: +row[1],
            chromEnd: +row[2],
            name: row[3],
            gieStain: row[4]
        }));
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
            band.chromEnd + 1);
    });

    return chromSizes;
}