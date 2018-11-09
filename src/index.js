import GenomeSpy from "./genomeSpy";
import { get } from './ajax';
import { Genome, parseUcscCytobands } from './genome';
import * as d3 from 'd3';
import { chromMapper } from "./chromMapper";
import SampleTrack from "./tracks/sampleTrack";
import SegmentLayer from "./layers/segmentLayer";
import AxisTrack from "./tracks/axisTrack";
import CytobandTrack from "./tracks/cytobandTrack";
import { GeneTrack, parseCompressedRefseqGeneTsv } from "./tracks/geneTrack";

//import rawCytobands from "../static/cytoBand.hg38.txt";
//import rawSegments from "../static/private/segsAll.csv";

"use strict";

function createContainer() {
    const body = document.body;
    body.style.margin = 0;
    body.style.padding = 0;

    const padding = "10px";
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.top = padding;
    container.style.right = padding;
    container.style.bottom = padding;
    container.style.left = padding;
    body.insertBefore(container, body.firstChild);

    return container;
}

function splitSampleName(name) {
    const match = name.match(/^((M|H|OC)[0-9]+)_([a-z]+)?((?:[A-Z][a-z]*)+?)(L|R)?([0-9x]+)?(?:_(CL)([0-9]+?))?(?:_(.*))?$/);
    return {
        phase: match[3],
        tissue: match[4]
    };
}

Promise.all([
    get("cytoBand.hg38.txt"),
    get("private/segsAll.csv"),
    get("private/refSeq_genes.hg38.compressed.txt")
])
    .then(files => {
        const cytobands = parseUcscCytobands(files[0]);
        const segmentations = d3.tsvParse(files[1]);

        //      const cytobands = parseUcscCytobands(rawCytobands);
        //      const segmentations = d3.tsvParse(rawSegments);

        const genome = new Genome("hg38", { cytobands });
        const cm = chromMapper(genome.chromSizes);

        const genes = parseCompressedRefseqGeneTsv(cm, files[2]);

        const samples = Array.from(new Set(segmentations.map(s => s.sample)))
            .map(s => ({
                id: s,
                displayName: s, // label
                data: splitSampleName(s) // sample-specific variables
            }));

        // ---- TODO: recipe ---- ///

        const colorScale = d3.scaleLinear()
            .domain([-3, 0, 1.5])
            .range(["#0040f8", "#f6f6f6", "#ff2800"]);

        const bySample = d3.nest()
            .key(d => d.sample)
            .entries(segmentations);

        const segBySample = new Map(bySample.map(entry => [
            entry.key,
            entry.values.map(segment => ({
                interval: cm.segmentToContinuous(segment.chr, +segment.startpos, +segment.endpos),
                color: d3.color(colorScale(+segment.segMean))
            }))]
        ));

        const lohBySample = new Map(bySample.map(entry => [
            entry.key,
            entry.values.map(segment => ({
                interval: cm.segmentToContinuous(segment.chr, +segment.startpos, +segment.endpos),
                paddingTop: 1.0 - Math.abs(segment.bafMean - 0.5) * 2,
                color: d3.color(colorScale(+segment.segMean)).darker(0.6).rgb()
            }))]
        ));

        // ---- TODO: recipe ---- ///

        const segRecipe = {};
        const pointData = [];

        const container = createContainer();

        const spy = new GenomeSpy(container, genome, [
            new CytobandTrack(),
            new SampleTrack(samples, [
                new SegmentLayer(segBySample),
                new SegmentLayer(lohBySample)
                //new SegmentLayer(segmentations, segRecipe),
                //new SegmentLayer(segmentations, lohRecipe),
                //new PointLayer(pointData)
            ]),
            new AxisTrack(),
            new GeneTrack(genes)
        ]);

        spy.launch();


    });

