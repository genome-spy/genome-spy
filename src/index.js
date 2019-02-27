import { tsvParse } from 'd3-dsv';
import { group } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { color } from 'd3-color';

import { scaleOrdinal } from 'd3-scale';
import { schemeCategory10 } from 'd3-scale-chromatic';

import GenomeSpyApp from "./genomeSpyApp";
import { Genome, parseUcscCytobands } from './genome';
import { chromMapper } from "./chromMapper";
import SampleTrack from "./tracks/sampleTrack/sampleTrack";
import SegmentLayer from "./layers/segmentLayer";
import AxisTrack from "./tracks/axisTrack";
import CytobandTrack from "./tracks/cytobandTrack";
import { GeneTrack, parseCompressedRefseqGeneTsv } from "./tracks/geneTrack";
import PointLayer from './layers/pointLayer';

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
 * @typedef {Object} GatherConfig
 * @prop {string} columnRegex
 * @prop {string} attribute
 * 
 * @typedef {Object} VariantDataConfig
 *    A configuration that specifies how data should be mapped
 *    to PointSpecs. The ultimate aim is to make this very generic
 *    and applicable to multiple types of data and visual encodings.
 * @prop {GatherConfig[]} gather
 * @prop {string} chrom
 * @prop {string} pos
 * @prop {Object} encodings TODO
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
        color: {
            attribute: "ExonicFunc.refGene",
            domain: ["nonsynonymous_SNV", "stoploss", "stopgain"]
            // range: [...custom rgb values here... or name of a color scheme]
        },
        // Shorthand for attribute object
        size: "VAF"
    }
    // TODO: Filtering
}


/**
 * 
 * @param {Object[]} rows Data parsed with d3.dsv
 * @param {GatherConfig[]} gatherConfigs
 */
function gather(rows, gatherConfigs) {
    // TODO: Support multiple attributes
    if (gatherConfigs.length > 1) {
        throw 'Currently only one attribute is supported in Gather configuration!';
    }
    const gatherConfig = gatherConfigs[0];
    
    const columnRegex = new RegExp(gatherConfig.columnRegex);

    /** @type {string} */
    const sampleColumns = rows.columns.filter(k => columnRegex.test(k));

    /** @type {Map<string, object>} */
    const gatheredAttributes = new Map();

    for (const sampleColumn of sampleColumns) {
        const sampleId = columnRegex.exec(sampleColumn)[1];

        const datums = rows.map(row => ({
            // TODO: Multiple attributes
            [gatherConfig.attribute]: row[sampleColumn]
        }));
        
        gatheredAttributes.set(sampleId, datums);
    }

    return gatheredAttributes;
}

/**
 * 
 * @param {*} cm 
 * @param {object[]} rows
 * @param {VariantDataConfig} dataConfig
 */
function createVariantLayer(cm, rows, dataConfig) {

    // Some ad-hoc code to parse a custom variant TSV files

    // ATTENTION! This is currently coded against a very specific config and is thus VERY fragile!
    const colorScale = scaleOrdinal(schemeCategory10);
    const mapSharedVariables = d => ({
        color: color(colorScale(d[dataConfig.encodings.color.attribute]))
    });

    const mapSampleVariables = d => ({
        size: parseFloat(d[dataConfig.encodings.size])
    });

    const vafLowerLimit = 0.05; // TODO: Configurable, implement in Configuration

    const inclusionPredicate = d => d.size >= vafLowerLimit;
    
    const gatheredSamples = gather(rows, dataConfig.gather);
    
    const sharedVariantVariables = rows
        .map(d => ({
            // TODO: 0 or 1 based addressing?
            // Add 0.5 to center the symbol inside nucleotide boundaries
            pos: cm.toContinuous(d[dataConfig.chrom], +d[dataConfig.pos]) + 0.5,
            ...mapSharedVariables(d)
        }));

    const pointsBySample = new Map();

    for (const [sampleId, gatheredRows] of gatheredSamples) {
        pointsBySample.set(
            sampleId,
            sharedVariantVariables.map((shared, i) => ({
                ...shared,
                ...mapSampleVariables(gatheredRows[i])
            }))
                .filter(inclusionPredicate)
        )
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
