import { tsvParse } from 'd3-dsv';
import { group, extent } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { color } from 'd3-color';

import GenomeSpyApp from "./genomeSpyApp";
import { Genome, parseUcscCytobands } from './genome';
import { chromMapper } from "./chromMapper";
import SampleTrack from "./tracks/sampleTrack/sampleTrack";
import SegmentLayer from "./layers/segmentLayer";
import AxisTrack from "./tracks/axisTrack";
import CytobandTrack from "./tracks/cytobandTrack";
import { GeneTrack, parseCompressedRefseqGeneTsv } from "./tracks/geneTrack";
import PointLayer from './layers/pointLayer';

import { gather, formalizeEncodingConfig, createEncodingMapper, createFilter } from './utils/visualScales';

//
// This file is a MESS and will be cleaned as the final architecture emerges
//

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has("conf")) {
    initWithConfiguration(urlParams.get("conf"))

} else {
    document.body.innerText = "No configuration defined!";
}

async function createSampleTrack(baseurl, cm, sampleTrackConf) {
    let samples;

    if (sampleTrackConf.samples) {
        // TODO: Accept a pre-parsed array of objects
        samples = processSamples(await fetch(baseurl + sampleTrackConf.samples).then(res => res.text()));

    } else {
        // TODO: infer from data
        /*
        samples = Array.from(new Set(segmentations.map(s => s.sample)))
        .map(s => ({
            id: s,
            displayName: s, // label
            attributes: { }
            */
        throw ("TODO");
    }

    const layers = [];

    for (let layerConf of sampleTrackConf.layers) {
        // TODO: Modularize
        if (layerConf.type == "CnvLoh") {
            // TODO: Accept a pre-parsed array of objects
            const segmentations = tsvParse(
                await fetch(baseurl + layerConf.data).then(res => res.text())
            )

            layers.push(...createCnvLohLayers(cm, segmentations, layerConf.spec));

        } else {
            throw `Unsupported layer type: ${layerConf.type}`;
        }
    }

    const variants = tsvParse(
        await fetch(baseurl + "variants.csv").then(res => res.text())
    )

    layers.push(...createVariantLayer(cm, variants, variantConfig));

    return new SampleTrack(samples, layers);
}


/**
 * @param {object | string} conf configuriation object or url to json configuration
 */
async function initWithConfiguration(conf) {

    if (typeof conf == "string") {
        const url = conf;
        try {
            conf = await fetch(url).then(res => res.json());
        } catch (e) {
            throw e;
        }

        conf.baseurl = conf.baseurl || url.match(/^.*\//)[0];
    } else {
        conf.baseurl = conf.baseurl || "";
    }

    const cytobands = parseUcscCytobands(
        await fetch(`cytoBand.${conf.genome}.txt`).then(res => res.text()));

    const genome = new Genome("hg38", { cytobands });
    const cm = chromMapper(genome.chromSizes);

    const genes = parseCompressedRefseqGeneTsv(
        cm,
        await fetch(`private/refSeq_genes_scored.${conf.genome}.compressed.txt`).then(res => res.text()));

    const tracks = [];
    for (let trackConf of conf.tracks) {
        // TODO: Modularize
        if (trackConf.type == "SampleTrack") {
            // TODO: Here's a dependency to baseurl and cm. Have to rethink this a bit...
            tracks.push(await createSampleTrack(conf.baseurl, cm, trackConf));

        } else {
            throw `Unsupported track type: ${trackConf.type}`;
        }
    }

    const app = new GenomeSpyApp(genome, [
        new CytobandTrack(),
        ...tracks,
        new AxisTrack(),
        new GeneTrack(genes)
    ]);
}


function extractAttributes(row) {
    const attributes = Object.assign({}, row);
    delete attributes.sample;
    delete attributes.displayName;
    return attributes;
}

function processSamples(sampleTsv) {
    return tsvParse(sampleTsv)
        .map(row => ({
            id: row.sample,
            displayName: row.displayName || row.sample,
            attributes: extractAttributes(row)
        }));
}


/**
 * @typedef {import("./utils/visualScales").VariantDataConfig} VariantDataConfig
 * @typedef {import("./utils/visualScales").EncodingConfig} EncodingConfig
 */

/** @type VariantDataConfig */
const variantConfig = {
    // Gather sample-specific attributes from columns
    gather: [{
        // Match the columns. First group indentifies the sample
        columnRegex: "^(.*)\\.AF$",
        // Publish the value as..
        attribute: "VAF"
    }],
    chrom: "CHROM",
    pos: "POS",
    encodings: {
        /** @type {EncodingConfig} */
        color: {
            attribute: "ExonicFunc.refGene",
            domain: ["nonsynonymous_SNV", "unknown", "stoploss", "stopgain"],
            // range: [...custom rgb values here... or name of a color scheme]
        },
        // Shorthand for attribute object
        size: "VAF"
    },
    filters: [{
        attribute: "VAF",
        operator: "gte",
        value: 0.05
    }]
}

/**
 * 
 * @param {*} cm 
 * @param {object[]} rows
 * @param {VariantDataConfig} dataConfig
 */
function createVariantLayer(cm, rows, dataConfig) {

    // Some ad-hoc code to parse a custom variant TSV files

    // TODO: Make enum, include constraints for ranges, etc, maybe some metadata (description)
    // TODO: Move to PointLayer or something...
    const visualVariables = {
        color: { type: "color" },
        size: { type: "number" }
    }

    /**
     * Now we assume that attribute is gathered if it is not in shared.
     * TODO: Throw an exception if it's was not published from gathered data
     */
    const isShared = attribute => rows.columns.indexOf(attribute) >= 0;


    const createCompositeMapper = (
        /** @type {function(string):boolean} */inclusionPredicate,
        /** @type {object[]} */sampleData
    ) => {
        const mappers = {};

        Object.entries(dataConfig.encodings || {})
            .forEach(([/** @type {string} */visualVariable, /** @type {EncodingConfig} */encodingConfig]) => {
                if (!visualVariables[visualVariable]) {
                    throw `Unknown visual variable: ${visualVariable}`;
                }
                
                encodingConfig = formalizeEncodingConfig(encodingConfig);

                if (inclusionPredicate(encodingConfig.attribute)) {
                    mappers[visualVariable] = createEncodingMapper(
                        visualVariables[visualVariable].type,
                        encodingConfig,
                        sampleData)
                }
            });

            const compositeMapper = d => {
                const mapped = {}
                Object.entries(mappers).forEach(([visualVariable, mapper]) => {
                    mapped[visualVariable] = mapper(d);
                });
                return mapped;
            };

            // Export for tooltips
            compositeMapper.mappers = mappers;

            return compositeMapper;
    }


    const createCompositeFilter = (
        /** @type {function(string):boolean} */inclusionPredicate
    ) => {
        // Trivial case
        if (!dataConfig.filters || dataConfig.filters.length <= 0) {
            return d => true;
        }

        const filterInstances = dataConfig.filters
            .filter(filter => inclusionPredicate(filter.attribute))
            .map(createFilter)
        
        return d => filterInstances.every(filter => filter(d));
    }
    

    const filterSharedVariables = createCompositeFilter(isShared);

    const columns = rows.columns;
    rows = rows.filter(filterSharedVariables);
    rows.columns = columns;
    
    const gatheredSamples = gather(rows, dataConfig.gather);

    const mapSharedVariables = createCompositeMapper(isShared, rows);

    // TODO: Maybe sampleData could be iterable
    const mapSampleVariables = gatheredSamples.size > 0 ?
        createCompositeMapper(x => !isShared(x), Array.prototype.concat.apply([], [...gatheredSamples.values()])) :
        x => ({});
    
    const filterSampleVariables = createCompositeFilter(x => !isShared(x));
    
    const sharedVariantVariables = rows
        .map(d => ({
            // TODO: 0 or 1 based addressing?
            // Add 0.5 to center the symbol inside nucleotide boundaries
            pos: cm.toContinuous(d[dataConfig.chrom], +d[dataConfig.pos]) + 0.5,
            ...mapSharedVariables(d)
        }));

    const pointsBySample = new Map();

    for (const [sampleId, gatheredRows] of gatheredSamples) {
        const combined = [];

        for (let i = 0; i < sharedVariantVariables.length; i++) {
            const gathered = gatheredRows[i];
            if (filterSampleVariables(gathered)) {
                combined.push({
                    ...sharedVariantVariables[i],
                    ...mapSampleVariables(gathered)
                });
            }
        }

        pointsBySample.set(sampleId, combined);
    }

    return [
        new PointLayer(pointsBySample)
    ];
}


function createCnvLohLayers(cm, segmentations, spec) {
    const bySample = group(segmentations, d => d[spec.sample]);

    const colorScale = scaleLinear()
        .domain([-3, 0, 1.5]) // TODO: Infer from data
        .range(["#0050f8", "#f6f6f6", "#ff3000"]);

    const transform = spec.logSeg ? (x => x) : Math.log2;

    const extractInterval = segment => cm.segmentToContinuous(
        segment[spec.chrom],
        parseInt(segment[spec.start]),
        parseInt(segment[spec.end]));

    const baf2loh = baf => (Math.abs(baf) - 0.5) * 2;

    // TODO: Precompute colors for the domain and use a lookup table. This is currently a bit slow.

    const segBySample = new Map([...bySample.entries()].map(entry => [
        entry[0],
        entry[1].map(segment => ({
            interval: extractInterval(segment),
            color: color(colorScale(transform(parseFloat(segment[spec.segMean])))),
            rawDatum: segment
        }))]
    ));

    const lohBySample = new Map([...bySample.entries()].map(entry => [
        entry[0],
        entry[1].map(segment => ({
            interval: extractInterval(segment),
            paddingTop: 1.0 - baf2loh(parseFloat(segment[spec.bafMean])),
            colorTop: color(colorScale(transform(parseFloat(segment[spec.segMean])))).darker(0.5).rgb(),
            colorBottom: color(colorScale(transform(parseFloat(segment[spec.segMean])))).darker(0.5).rgb(),
            rawDatum: segment
        }))]
    ));

    return [
        new SegmentLayer(segBySample),
        new SegmentLayer(lohBySample)
    ];
}
