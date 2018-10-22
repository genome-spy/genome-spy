import { Matrix4 } from 'math.gl';
import { AnimationLoop, Program, VertexArray, Buffer, setParameters, fp64, createGLContext } from 'luma.gl';
import * as d3 from 'd3';
import Track from './track';

/**
 * A track that displays one or more samples as sub-tracks.
 */
export default class SampleTrack extends Track {

    constructor(samples, layers) {
        super(samples, layers);

        /*
         * An array of sample objects. Their order stays constant.
         * Properties: id, displayName, data. Data contains arbitrary sample-specific
         * variables, e.g. clinical data.
         */
        this.samples = samples;

        /*
         * A mapping that specifies the order of the samples.
         */
        this.sampleOrder = [];

        this.layers = layers;

        this.margin = 10; // TODO: Find a better place
    }

    /*
    getHeight() {
        return 100;
    }
    */

    /**
     * Returns the minimum width that accommodates the labels on the Y axis.
     * The axis area of sampleTrack contains sample labels and sample-specific
     * variables.
     * 
     * @returns {number} The width
     */
    getMinAxisWidth() {
        return 0;
    }

    resizeCanvas() {
        this.glCanvas.width = this.trackContainer.offsetWidth;
        this.glCanvas.height = this.trackContainer.offsetHeight;
    }

    initialize({genomeSpy, trackContainer}) {
        super.initialize({genomeSpy, trackContainer});

        this.sampleScale = d3.scaleBand()
            .domain(this.samples.map(sample => sample.id))
            .align(0)
            .paddingInner(0.25); // TODO: Configurable

        const thisTrack = this;
        const thisSpy = this.genomeSpy;

        this.trackContainer.style = "flex-grow: 1; overflow: hidden"; // TODO: Make this more abstract

        // Canvas for WebGL
        this.glCanvas = this.createCanvas();

        genomeSpy.on("layout", this.resizeCanvas.bind(this));

        this.animationLoop = new AnimationLoop({
            debug: true,
            onCreateContext() {
                return createGLContext({ canvas: thisTrack.glCanvas });
            },

            onInitialize({ gl, canvas, aspect }) {
                thisTrack.resizeCanvas();

                setParameters(gl, {
                    clearColor: [1, 1, 1, 1],
                    clearDepth: [1],
                    depthTest: false,
                    depthFunc: gl.LEQUAL
                });

                thisTrack.layers.forEach(layer => layer.initialize({thisTrack, gl}));
            },

            onRender(animationProps) {

                if (true || animationProps.needsRedraw) {
                    const height = animationProps.height;
                    const width = animationProps.width;
                    const gl = animationProps.gl;

                    thisSpy.xScale.range([0, width - thisTrack.margin]); // TODO: Woot

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

                    thisTrack.renderGl(Object.assign({}, animationProps, { projection }));

                }
            }
        });

        this.animationLoop.start();

    }


    renderGl({gl, projection, width, height}) {

        const domain = this.genomeSpy.getVisibleDomain();

        this.sampleScale.rangeRound([this.margin, height - this.margin]);

        const globalUniforms = {
            uDomainBegin: fp64.fp64ify(domain[0]),
            uDomainWidth: fp64.fp64ify(domain[1] - domain[0]),
        };

        for (let i = 0; i < this.samples.length; i++) {
            const sample = this.samples[i];
            const sampleId = sample.id;

            const view = new Matrix4()
                .translate([this.margin, this.sampleScale(sampleId), 0])
                .scale([width - this.margin, this.sampleScale.bandwidth(), 1]);

            const uniforms = Object.assign({
                uTMatrix: projection.clone().multiplyRight(view),
            }, globalUniforms);

            this.layers.forEach(layer => layer.render(sampleId, gl, uniforms));
        }
    }
}