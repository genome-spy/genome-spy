import GenomeSpy from "./src/genomeSpy";
import { get } from './src/ajax';
import { Genome, parseCytobands } from './src/genome';
import * as d3 from 'd3';
import { chromMapper } from "./src/chromMapper"
import SampleTrack from "./src/tracks/sampleTrack"
import SegmentLayer from "./src/layers/segmentLayer"

"use strict";

function createContainer() {
    const body = document.body;
    body.style.margin = 0;
    body.style.padding = 0;

    const container = document.createElement("div");
    container.style.width = "100vw";
    container.style.height = "100vh";
    body.insertBefore(container, body.firstChild);

    return container;
}

Promise.all([get("cytoBand.hg38.txt"), get("segsAll.csv")])
  .then(files => {
      const cytobands = parseCytobands(files[0]);
      const segmentations = d3.tsvParse(files[1]);

      const genome = new Genome("hg38", { cytobands });

      const samples = Array.from(new Set(segmentations.map(s => s.sample)))
        .map(s => ({
            id: s,
            displayName: s, // label
            data: { } // sample-specific variables
        }));
          
      console.log(samples);

      // ---- TODO: recipe ---- ///
      const cm = chromMapper(genome.chromSizes);
      console.log(cm.linearChromPositions());

      const colorScale = d3.scaleLinear()
          .domain([-3, 0, 1.5])
          .range(["#0040f8", "#f6f6f6", "#ff2800"]);

      const bySample = d3.nest()
          .key(d => d.sample)
          .entries(segmentations);

      const segBySample = new Map(bySample.map(entry => [
          entry.key,
          entry.values.map(segment => ({
              begin: cm.linLoc([segment.chr, +segment.startpos]),
              end: cm.linLoc([segment.chr, +segment.endpos]),
              color: d3.color(colorScale(+segment.segMean))
          }))]
      ));
      console.log(segBySample);

      const lohBySample = new Map(bySample.map(entry => [
          entry.key,
          entry.values.map(segment => ({
              begin: cm.linLoc([segment.chr, +segment.startpos]),
              end: cm.linLoc([segment.chr, +segment.endpos]),
              paddingTop: 1.0 - Math.abs(segment.bafMean - 0.5) * 2,
              color: d3.color(colorScale(+segment.segMean)).darker(0.6).rgb()
          }))]
      ));


      // ---- TODO: recipe ---- ///

      const segRecipe = {};
      const pointData = [];

      const container = createContainer();

      const spy = new GenomeSpy(container, genome, [
          new SampleTrack(samples, [
              new SegmentLayer(segBySample),
              new SegmentLayer(lohBySample)
              //new SegmentLayer(segmentations, segRecipe),
              //new SegmentLayer(segmentations, lohRecipe),
              //new PointLayer(pointData)
          ])

      ]);
      
      spy.launch();


  });

