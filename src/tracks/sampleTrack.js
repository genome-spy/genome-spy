import { Matrix4 } from 'math.gl';
import {
    setParameters, fp64, createGLContext, registerShaderModules
} from 'luma.gl';
import * as d3 from 'd3';
import WebGlTrack from './webGlTrack';

// @ts-check

const defaultConfig = {
    paddingInner: 0.2, // Relative to sample height
    paddingOuter: 0.2,

    attributeWidth: 12, // in pixels
    attributePaddingInner: 0.05,

    fontSize: 12,
    fontFamily: "sans-serif",

    horizontalSpacing: 10 // TODO: Find a better place
}

/**
 * A track that displays one or more samples as sub-tracks.
 */
export default class SampleTrack extends WebGlTrack {

    constructor(samples, layers) {
        super();

        this.config = defaultConfig;

        this.axisArea = {};

        /**
         * An array of sample objects. Their order stays constant.
         * Properties: id, displayName, attributes. Data contains arbitrary sample-specific
         * attributes, e.g. clinical data.
         * 
         * @type {{id: string, displayName: string, attributes: Object}[]}
         */
        this.samples = samples;

        /**
         * A mapping that specifies the order of the samples.
         * 
         * @type {string[]}
         */
        this.sampleOrder = [];

        /**
         * @type {Array}
         */
        this.layers = layers;

        this.prepareSampleAttributes();

        // TODO: Consider a setSamples() method
        const ctx = this.get2d(document.createElement("canvas"));
        ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`;
        this.axisArea.maxLabelWidth = this.samples
            .map(sample => ctx.measureText(sample.displayName).width)
            .reduce((a, b) => Math.max(a, b), 0);
    }

    /**
     * Returns the minimum width that accommodates the labels on the Y axis.
     * The axis area of sampleTrack contains sample labels and sample-specific
     * attributes.
     * 
     * @returns {number} The width
     */
    getMinAxisWidth() {
        return this.axisArea.maxLabelWidth +
            this.config.horizontalSpacing +
            this.axisArea.attributeScales.size * this.config.attributeWidth +
            this.config.horizontalSpacing;
    }

    resizeCanvases(layout) {
        const trackHeight = this.trackContainer.clientHeight;

        this.adjustCanvas(this.labelCanvas, layout.axis);
        this.adjustCanvas(this.glCanvas, layout.viewport);
        this.adjustGl(this.gl);

        this.sampleScale.range([0, trackHeight]);
    }

    /**
     * @param {import("../genomeSpy").default} genomeSpy 
     * @param {HTMLElement} trackContainer 
     */
    initialize(genomeSpy, trackContainer) {
        super.initialize(genomeSpy, trackContainer);

        this.sampleScale = d3.scaleBand()
            .domain(this.samples.map(sample => sample.id))
            .paddingInner(this.config.paddingInner)
            .paddingOuter(this.config.paddingOuter);

        this.trackContainer.className = "sample-track";

        this.labelCanvas = this.createCanvas();

        // Canvas for WebGL
        this.glCanvas = this.createCanvas();

        registerShaderModules([fp64], { ignoreMultipleRegistrations: true });

        const gl = createGLContext({ canvas: this.glCanvas });
        this.gl = gl;

        setParameters(gl, {
            clearColor: [1, 1, 1, 1],
            clearDepth: [1],
            depthTest: false,
            depthFunc: gl.LEQUAL
        });

        this.layers.forEach(layer => layer.initialize(this));

        genomeSpy.on("layout", layout => {
            this.resizeCanvases(layout);
            this.renderLabels();
            this.renderViewport();
        });

        genomeSpy.on("zoom", () => {
            this.renderViewport();
        });

        genomeSpy.zoom.attachZoomEvents(this.glCanvas);
    }

    /**
     * Render the axis area, which contains labels and sample-specific attributes 
     */
    renderLabels() {
        const ctx = this.get2d(this.labelCanvas);
        ctx.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);

        ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`;

        const offset = Math.floor((this.sampleScale.bandwidth() + this.config.fontSize) / 2);
        const attributeOffset = Math.ceil(this.axisArea.maxLabelWidth + this.config.horizontalSpacing);

        this.samples.forEach(sample => {
            const y = this.sampleScale(sample.id);

            ctx.fillStyle = "black";
            ctx.fillText(
                sample.displayName,
                0,
                y + offset);

            this.axisArea.attributeScales
                .forEach((valueScale, key) => {
                    ctx.fillStyle = valueScale(sample.attributes[key]);
                    ctx.fillRect(
                        attributeOffset + this.axisArea.attributeBandScale(key),
                        y,
                        this.axisArea.attributeBandScale.bandwidth(),
                        this.sampleScale.bandwidth());
                });
        });
    }


    renderViewport() {
        const gl = this.gl;

        //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const width = gl.canvas.clientWidth;

        this.samples.forEach(sample => {
            const view = new Matrix4()
                .translate([0, this.sampleScale(sample.id), 0])
                .scale([width, this.sampleScale.bandwidth(), 1]);

            const uniforms = Object.assign(
                {
                    uTMatrix: this.projection.clone().multiplyRight(view),
                },
                this.getDomainUniforms()
            );

            this.layers.forEach(layer => layer.render(sample.id, uniforms));
        });
    }

    /**
     * Builds scales for sample-specific attributes, e.g. clinical data
     */
    prepareSampleAttributes() {
        // Find all attributes
        const attributeNames = this.samples
            .flatMap(sample => Object.keys(sample.attributes))
            .reduce((set, key) => set.add(key), new Set());

        const inferNumerality = attributeName => this.samples
            .map(sample => sample.attributes[attributeName])
            .filter(value => typeof value == "string")
            .filter(value => value !== "")
            .every(value => /^[+-]?\d+(\.\d*)?$/.test(value));

        this.axisArea.attributeScales = new Map();

        // TODO: Make all of this configurable

        attributeNames.forEach(attributeName => {
            if (inferNumerality(attributeName)) {
                const accessor = sample => sample.attributes[attributeName];

                // Convert types
                for (let sample of this.samples.values()) {
                    sample.attributes[attributeName] = parseFloat(accessor(sample));
                }

                const extent = d3.extent(this.samples, accessor);
                this.axisArea.attributeScales.set(
                    attributeName,
                    d3.scaleSequential(d3.interpolateOrRd)
                        .domain(extent));

                // TODO: Diverging scale if domain extends to negative values

            } else {
                this.axisArea.attributeScales.set(attributeName, d3.scaleOrdinal(d3.schemeCategory10));
            }
        });


        // Map a attribute name to a horizontal coordinate
        this.axisArea.attributeBandScale = d3.scaleBand()
            .domain(Array.from(attributeNames.keys()))
            .paddingInner(this.config.attributePaddingInner)
            // TODO: Move to renderLabels()
            .range([0, this.config.attributeWidth * attributeNames.size]);
    }
}