import Events from "eventemitter3"
import * as d3 from 'd3';
import { chromMapper } from "./chromMapper"
import { AnimationLoop, Program, VertexArray, Buffer, setParameters, fp64, createGLContext } from 'luma.gl';
import { Matrix4 } from 'math.gl';


/**
 * The actual browser without any toolbars etc
 */
export default class GenomeSpy {
    constructor(container, genome, tracks) {
        this.genome = genome;
        this.container = container;
        this.tracks = tracks;

        this.chromMapper = chromMapper(genome.chromSizes);

        this.xScale = d3.scaleLinear()
            .domain(this.chromMapper.extent());
        
        // Zoomed scale
        this.rescaledX = this.xScale;

        // Canvas for WebGL
        this.glCanvas = this.createCanvas();

        Object.assign(this, Events.prototype);
    }

    createCanvas() {
        const canvas = document.createElement("canvas");
        canvas.width = null;
        canvas.height = null;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        this.container.insertBefore(canvas, this.container.firstChild);
        return canvas;
    }


    zoomed() {
        this.rescaledX = d3.event.transform.rescaleX(this.xScale);
        this.animationLoop.setNeedsRedraw("Zoomed");
        console.log("zoomed()");
    }
    
    getVisibleDomain() {
        return this.rescaledX.domain();
    }

    // TODO: Come up with a sensible name. And maybe this should be called at the end of the constructor.
    launch() {
        const spy = this;

        const genomeExtent = this.chromMapper.extent();

        d3.select(spy.container).call(d3.zoom()
            // TODO: viewport extent
            .scaleExtent([1, genomeExtent[1] / spy.container.offsetWidth / 10])
            .translateExtent([[genomeExtent[0], -Infinity], [genomeExtent[1], Infinity]]) // Check this: https://bl.ocks.org/mbostock/4015254
            .on("zoom", this.zoomed.bind(this)));

        this.animationLoop = new AnimationLoop({
            debug: true,
            onCreateContext() {
                return createGLContext({ canvas: spy.glCanvas });
            },

            onInitialize({ gl, canvas, aspect }) {
                setParameters(gl, {
                    clearColor: [1, 1, 1, 1],
                    clearDepth: [1],
                    depthTest: false,
                    depthFunc: gl.LEQUAL
                });

                spy.tracks.forEach(track => track.initializeGl({ gl, spy }));
            },

            onRender({ gl, width, height, needsRedraw }) {

                if (false || needsRedraw) {
                    console.log("needsRedraw: " + needsRedraw);

                    const margin = 10;

                    spy.xScale.range([0, width - margin])

                    const projection = new Matrix4().ortho({
                        left: 0,
                        right: width,
                        bottom: height,
                        top: 0,
                        near: 0,
                        far: 500
                    });

                    //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                    gl.clear(gl.COLOR_BUFFER_BIT);

                    spy.tracks.forEach(track => {
                        // TODO: For each track, compute a view matrix that is translated and scaled to appropriate coordinates.
                        // TODO: Set up clipping
                        track.renderGl({ spy, gl, projection });
                    });

                }
            }
        });


        /* global window */
        if (!window.website) {
            this.animationLoop.start();
        }
    }
}