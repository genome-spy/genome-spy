import * as d3 from 'd3';
import { AnimationLoop, Program, VertexArray, Buffer, setParameters, fp64, createGLContext } from 'luma.gl';
import { Matrix4 } from 'math.gl';
import { RectangleModel } from './src/glModels/rectangleModel'
import { chromMapper, extractChromSizes } from './src/chromMapper';
import { get } from './src/ajax';

const xScale = d3.scaleLinear();

var rescaledX = xScale;

const colorScale = d3.scaleLinear()
  .domain([-3, 0, 1.5])
  .range(["#0040f8", "#f6f6f6", "#ff2800"]);


function zoomed() {
  rescaledX = d3.event.transform.rescaleX(xScale);
  //animationLoop.setNeedsRedraw("Zoomed");
  //console.log(rescaledX.domain());
}

Promise.all([get("cytoBand.hg38.txt"), get("segsAll.csv")])
  .then(values => {

    const cm = chromMapper(extractChromSizes(d3.tsvParseRows(values[0]).filter(b => /^chr[0-9XY]{1,2}$/.test(b[0]))));

    xScale.domain(cm.extent());

    const segmentations = d3.tsvParse(values[1]);

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

    const lohBySample = new Map(bySample.map(entry => [
      entry.key,
      entry.values.map(segment => ({
        begin: cm.linLoc([segment.chr, +segment.startpos]),
        end: cm.linLoc([segment.chr, +segment.endpos]),
        paddingTop: 1.0 - Math.abs(segment.bafMean - 0.5) * 2,
        color: d3.color(colorScale(+segment.segMean)).darker(0.6).rgb()
      }))]
    ));


    const animationLoop = new AnimationLoop({
      debug: true,
      onCreateContext() {
        const canvas = document.createElement("canvas");
        canvas.width = null;
        canvas.height = null;
        canvas.style.width = "100vw";
        canvas.style.height = "100vh";

        const body = document.body;
        body.style.margin = 0;
        body.style.padding = 0;

        body.insertBefore(canvas, body.firstChild);

        return createGLContext({ canvas: canvas });
      },

      onInitialize({ gl, canvas, aspect }) {

        setParameters(gl, {
          clearColor: [1, 1, 1, 1],
          clearDepth: [1],
          depthTest: false,
          depthFunc: gl.LEQUAL
        });

        const segModels = segBySample.map(rects => new RectangleModel(gl, rects));
        const lohModels = lohBySample.map(rects => new RectangleModel(gl, rects));

        d3.select(canvas).call(d3.zoom()
          .scaleExtent([1, cm.extent()[1] / canvas.width / 10])
          .translateExtent([[cm.extent()[0], -Infinity], [cm.extent()[1], Infinity]]) // Upper bound not working!?
          .on("zoom", zoomed));

        return {
          segModels,
          lohModels
        }

      },

      onRender({ gl, width, height, needsRedraw, segModels, lohModels}) {

        const margin = 10;

        const spacing = 0.25;
        const trackCount = segModels.length;

        const barHeight =  Math.floor(height / trackCount * (1 - spacing));
        const barSpacing = Math.floor(height / trackCount * spacing);

        if (true || needsRedraw) {
          xScale.range([0, width - margin])
         //const view = new Matrix4().translate([10, 10, 0]).scale([10, 20, 1]);

          const projection = new Matrix4().ortho({
            left: 0,
            right: width,
            bottom: height,
            top: 0,
            near: 0,
            far: 500
          });

          //const projection = new Matrix4().identity();
          //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          gl.clear(gl.COLOR_BUFFER_BIT);

          const domain = rescaledX.domain();

          for (let i = 0; i < segModels.length; i++) {
            const view = new Matrix4().translate([margin, margin + i * (barHeight + barSpacing), 0]).scale([width - margin, barHeight, 1]);
 
            const uniforms = {
              uTMatrix: projection.clone().multiplyRight(view),

              uDomainBegin: fp64.fp64ify(domain[0]),
              uDomainWidth: fp64.fp64ify(domain[1] - domain[0]),
            };

            segModels[i].render(uniforms);

            //gl.enable(gl.BLEND);
            //gl.disable(gl.DEPTH_TEST);
            //gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            lohModels[i].render(uniforms);
            //gl.disable(gl.BLEND);
          }
        }
      }
    });


    //export default animationLoop;

    /* global window */
    if (!window.website) {
      animationLoop.start();
    }

  });

