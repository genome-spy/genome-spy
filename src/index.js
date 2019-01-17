import GenomeSpyApp from "./genomeSpyApp";
import { get } from './ajax';
import { Genome, parseUcscCytobands } from './genome';
import * as d3 from 'd3';
import { chromMapper } from "./chromMapper";
import SampleTrack from "./tracks/sampleTrack";
import SegmentLayer from "./layers/segmentLayer";
import AxisTrack from "./tracks/axisTrack";
import CytobandTrack from "./tracks/cytobandTrack";
import { GeneTrack, parseCompressedRefseqGeneTsv } from "./tracks/geneTrack";

const conf_ParpiCL = {
    genome: "hg38",
    tracks: [
        {
            type: "SampleTrack",
            samples: "private/ParpiCL_samples.csv",
            layers: [
                {
                    type: "CnvLoh",
                    data: "private/ParpiCL_cnv_ascatAll.csv",
                    spec: {
                        sample: "Sample",
                        chrom: "Chromosome",
                        start: "Start",
                        end: "End",
                        segMean: "Segment_Mean",
                        bafMean: "meanBaf",

                        logSeg: false
                    }
                }
            ]
        }
    ]
};

const conf_set5 = {
    genome: "hg38",
    tracks: [
        {
            type: "SampleTrack",
            samples: "private/set5_samples.csv",
            layers: [
                {
                    type: "CnvLoh",
                    data: "private/set5_segsAll.csv",
                    spec: {
                        sample: "sample",
                        chrom: "chr",
                        start: "startpos",
                        end: "endpos",
                        segMean: "segMean",
                        bafMean: "bafMean",

                        logSeg: true 
                    }
                }
            ]
        }
    ]
};

initWithConfiguration(conf_set5);
//initWithConfiguration(conf_ParpiCL);

async function createSampleTrack(cm, sampleTrackConf) {
    let samples;

    if (sampleTrackConf.samples) {
        // TODO: Accept a pre-parsed array of objects
        samples = processSamples(await fetch(sampleTrackConf.samples).then(res => res.text()));

    } else {
        // TODO: infer from data
        /*
        samples = Array.from(new Set(segmentations.map(s => s.sample)))
        .map(s => ({
            id: s,
            displayName: s, // label
            attributes: { }
            */
        throw("TODO");
    }

    const layers = [];
    
    for (let layerConf of sampleTrackConf.layers) {
        // TODO: Modularize
        if (layerConf.type == "CnvLoh") {
            // TODO: Accept a pre-parsed array of objects
            const segmentations = d3.tsvParse(
                await fetch(layerConf.data).then(res => res.text())
            )

            layers.push(...createCnvLohLayers(cm, segmentations, layerConf.spec));

        } else {
            throw `Unsupported layer type: ${layerConf.type}`;
        }
    };

    return new SampleTrack(samples, layers);
}


async function initWithConfiguration(conf) {
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
            // TODO: Here's a dependency to cm. Have to rethink this a bit...
            tracks.push(await createSampleTrack(cm, trackConf));

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
    return d3.tsvParse(sampleTsv)
        .map(row => ({
            id: row.sample,
            displayName: row.displayName || row.sample,
            attributes: extractAttributes(row)
        }));
}


function createCnvLohLayers(cm, segmentations, spec) {
    const bySample = d3.nest()
        .key(d => d[spec.sample])
        .entries(segmentations);

    const colorScale = d3.scaleLinear()
        .domain([-3, 0, 1.5]) // TODO: Infer from data
        .range(["#0050f8", "#f6f6f6", "#ff3000"]);

    const transform = spec.logSeg ? (x => x) : Math.log2;

    const extractInterval = segment => cm.segmentToContinuous(
        segment[spec.chrom],
        parseInt(segment[spec.start]),
        parseInt(segment[spec.end]));

    const baf2loh = baf => (Math.abs(baf) - 0.5) * 2;

    // TODO: Use https://github.com/d3/d3-array#group
    const segBySample = new Map(bySample.map(entry => [
        entry.key,
        entry.values.map(segment => ({
            interval: extractInterval(segment),
            color: d3.color(colorScale(transform(parseFloat(segment[spec.segMean]))))
        }))]
    ));

    const lohBySample = new Map(bySample.map(entry => [
        entry.key,
        entry.values.map(segment => ({
            interval: extractInterval(segment),
            paddingTop: 1.0 - baf2loh(parseFloat(segment[spec.bafMean])),
            colorTop: d3.color(colorScale(transform(parseFloat(segment[spec.segMean])))).darker(0.7).rgb(),
            colorBottom: d3.color(colorScale(transform(parseFloat(segment[spec.segMean])))).darker(0.2).rgb()
        }))]
    ));

    return [
        new SegmentLayer(segBySample),
        new SegmentLayer(lohBySample)
    ];
}
