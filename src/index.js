import { tsvParse } from 'd3-dsv';
import { group } from 'd3-array';
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

    layers.push(...createVariantLayer(cm, variants));

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
 * 
 * @param {*} cm 
 * @param {object[]} variants 
 */
function createVariantLayer(cm, variants) {

    // Some ad-hoc code to parse a custom variant TSV files

    const vafLowerLimit = 0.1;

    const variantsBySample = new Map();

    const positions = variants
        .map(v => cm.toContinuous(v["CHROM"], +v["POS"]));

    const sampleColumns = variants.columns
        .filter(k => k.endsWith(".AF"));

    for (const sampleColumn of sampleColumns) {
        const sampleId = sampleColumn.replace(/\.AF$/, "");

        const datums = [];

        for (let i = 0; i < positions.length; i++) {
            const variant = variants[i];
            const vaf = Number.parseFloat(variant[sampleColumn]);
            if (vaf >= vafLowerLimit) {
                datums.push({
                    pos: positions[i],
                    size: Math.sqrt(vaf),
                    rawDatum: variant
                });
            }
        }

        variantsBySample.set(sampleId, datums);
    }

    return [
        new PointLayer(variantsBySample)
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
