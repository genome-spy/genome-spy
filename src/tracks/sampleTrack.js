import { Matrix4 } from 'math.gl';
import { AnimationLoop, Program, VertexArray, Buffer,
    setParameters, fp64, createGLContext, _ShaderCache as ShaderCache } from 'luma.gl';
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

        this.axisArea = {
            /** Width of an individual sample variable */
            variableWidth: 12,
            labelFontSize: 11, // TODO: Find a better place
            labelFont: "sans-serif"
        };

        this.margin = 10; // TODO: Find a better place

        this.prepareSampleVariables();

        // TODO: Consider a setSamples() method
        const ctx = document.createElement("canvas").getContext("2d");
        ctx.font = `${this.labelFontSize}px ${this.labelFont}`;
        this.axisArea.maxLabelWidth = this.samples
            .map(sample => ctx.measureText(sample.displayName).width)
            .reduce((a, b) => Math.max(a, b), 0);
    }

    /**
     * Returns the minimum width that accommodates the labels on the Y axis.
     * The axis area of sampleTrack contains sample labels and sample-specific
     * variables.
     * 
     * @returns {number} The width
     */
    getMinAxisWidth() {
        return this.axisArea.maxLabelWidth +
            this.margin +
            this.axisArea.variableScales.size * this.axisArea.variableWidth +
            this.margin;
    }

    resizeCanvases() {
        const axisWidth = this.genomeSpy.getAxisWidth();
        const trackWidth = this.trackContainer.offsetWidth;
        const trackHeight = this.trackContainer.offsetHeight;

        this.labelCanvas.width = axisWidth;
        this.labelCanvas.height = trackHeight;

        this.glCanvas.width = trackWidth - axisWidth;
        this.glCanvas.style.left = `${axisWidth}px`;
        this.glCanvas.height = trackHeight;

        this.sampleScale.rangeRound([this.margin, trackHeight - this.margin]);
        this.renderLabels();
    }

    initialize({genomeSpy, trackContainer}) {
        super.initialize({genomeSpy, trackContainer});

        this.sampleScale = d3.scaleBand()
            .domain(this.samples.map(sample => sample.id))
            .align(0)
            .paddingInner(0.25); // TODO: Configurable

        const thisTrack = this;
        const thisSpy = this.genomeSpy;

        this.trackContainer.style = "flex-grow: 1; overflow: hidden; position: relative"; // TODO: Make this more abstract

        this.labelCanvas = this.createCanvas();

        // Canvas for WebGL
        this.glCanvas = this.createCanvas();

        // TODO: Find a more appropriate place
        thisTrack.resizeCanvases();

        genomeSpy.on("layout", this.resizeCanvases.bind(this));

        this.animationLoop = new AnimationLoop({
            debug: true,
            onCreateContext() {
                return createGLContext({ canvas: thisTrack.glCanvas });
            },

            onInitialize({ gl, canvas, aspect }) {
                // TODO: What if multiple gl contexts per track? (labels)
                thisTrack.shaderCache = new ShaderCache({gl});

                setParameters(gl, {
                    clearColor: [1, 1, 1, 1],
                    clearDepth: [1],
                    depthTest: false,
                    depthFunc: gl.LEQUAL
                });

                thisTrack.layers.forEach(layer => layer.initialize({sampleTrack: thisTrack, gl}));
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

    /**
     * Render the axis area, which contains labels and sample-specific variables
     */
    renderLabels() {
        const ctx = this.labelCanvas.getContext("2d");
        ctx.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);

        ctx.font = `${this.labelFontSize}px ${this.labelFont}`;

        const offset = Math.floor((this.sampleScale.bandwidth() + this.axisArea.labelFontSize) / 2);
        const variableOffset = Math.ceil(this.axisArea.maxLabelWidth + this.margin * 2);

        this.samples.forEach(sample => {
            const y = this.sampleScale(sample.id);

            ctx.fillStyle = "black";
            ctx.fillText(
                sample.displayName,
                this.margin,
                y + offset);

            this.axisArea.variableScales
                .forEach((valueScale, key) => {
                    ctx.fillStyle = valueScale(sample.data[key]);
                    ctx.fillRect(
                        variableOffset + this.axisArea.variableBandScale(key),
                        y,
                        this.axisArea.variableBandScale.bandwidth(),
                        this.sampleScale.bandwidth());
                });
        });
    }

    renderGl({gl, projection, width, height}) {

        const domain = this.genomeSpy.getVisibleDomain();

        const globalUniforms = {
            uDomainBegin: fp64.fp64ify(domain[0]),
            uDomainWidth: fp64.fp64ify(domain[1] - domain[0]),
        };

        this.samples.forEach(sample => {
            const view = new Matrix4()
                .translate([this.margin, this.sampleScale(sample.id), 0])
                .scale([width - this.margin, this.sampleScale.bandwidth(), 1]);

            const uniforms = Object.assign({
                uTMatrix: projection.clone().multiplyRight(view),
            }, globalUniforms);

            this.layers.forEach(layer => layer.render(sample.id, gl, uniforms));
        });
    }

    /**
     * Builds scales for sample-specific variables, e.g. clinical data
     */
    prepareSampleVariables() {
        // Find all variables
        const variableNames = this.samples
            .flatMap(sample => Object.keys(sample.data))
            .reduce((set, key) => set.add(key), new Set());
        
        // Map a color for a variable (value)
        this.axisArea.variableScales = new Map(
            Array.from(variableNames).map(name => [
                name,
                d3.scaleOrdinal(d3.schemeCategory10)
            ])
        );

        // Map a variable name to a horizontal coordinate
        this.axisArea.variableBandScale = d3.scaleBand()
            .domain(Array.from(variableNames.keys()))
            .paddingInner(0.2)
            // TODO: Move to renderLabels()
            .rangeRound([0, this.axisArea.variableWidth * variableNames.size]);
    }
}