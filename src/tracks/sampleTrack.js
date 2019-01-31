import { Matrix4 } from 'math.gl';
import {
    setParameters, fp64, createGLContext, registerShaderModules
} from 'luma.gl';
import * as d3 from 'd3';
import WebGlTrack from './webGlTrack';
import BandScale from '../utils/bandScale';
import MouseTracker from "../mouseTracker";
import Interval from '../utils/interval';
import * as html from "../utils/html";
import fisheye from "../utils/fishEye";

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
         * // TODO: layer base class
         * @type {import("../layers/segmentLayer").default[]}
         */
        this.layers = layers;

        this.prepareSampleAttributes();

        // TODO: Consider a setSamples() method
        const ctx = this.get2d(document.createElement("canvas"));
        ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`;
        this.axisArea.maxLabelWidth = this.samples
            .map(sample => ctx.measureText(sample.displayName).width)
            .reduce((a, b) => Math.max(a, b), 0);

        this.textCache = new CanvasTextCache(this.config.fontSize, this.config.fontFamily);
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

        // TODO: Need a real layoutbuilder
        const builder = {
            tail: 0,
            add: function(width) {
                const int = new Interval(this.tail, this.tail + width);
                this.tail += width;
                return int;
            }
        } 

        this.axisArea.labelInterval = builder.add(Math.ceil(this.axisArea.maxLabelWidth));
        builder.add(this.config.horizontalSpacing);
        this.axisArea.attributeInterval = builder.add(this.axisArea.attributeScales.size * this.config.attributeWidth);

    }

    /**
     * @param {import("../genomeSpy").default} genomeSpy 
     * @param {HTMLElement} trackContainer 
     */
    initialize(genomeSpy, trackContainer) {
        super.initialize(genomeSpy, trackContainer);

        this.sampleScale = new BandScale();
        this.sampleScale.domain(this.samples.map(sample => sample.id));
        this.sampleScale.paddingInner = this.config.paddingInner;
        this.sampleScale.paddingOuter = this.config.paddingOuter;

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

        this.viewportMouseTracker = new MouseTracker({
            element: this.glCanvas,
            tooltip: this.genomeSpy.tooltip,
            resolver: this.findDatumAt.bind(this),
            tooltipConverter: datum => Promise.resolve(this.datumToTooltip(datum))
        });

        this.axisAreaMouseTracker = new MouseTracker({
            element: this.labelCanvas,
            tooltip: this.genomeSpy.tooltip,
            resolver: this.findSampleIdAt.bind(this),
            // TODO: Map for samples
            tooltipConverter: sampleId => Promise.resolve(
                this.sampleToTooltip(this.samples.filter(sample => sample.id == sampleId)[0]))
        });

        this.initializeFisheye()


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
     * Initializes fisheye functionality.
     * TODO: Currently a quick hack. Put some effort to design
     * TODO: Smoothly animated transition to activation/inactivation
     */
    initializeFisheye() {
        /** @type {MouseEvent} */
        let lastMouseEvent = null;

        const render = () => {
            this.renderViewport();
            this.renderLabels();
        };

        const focus = () => {
            this.fisheye.focus([0, d3.clientPoint(this.glCanvas, lastMouseEvent)[1]]);
            render();

        }

        const moveListener = event => {
            lastMouseEvent = event;
            if (this.fisheye) {
                focus();
            }
        }

        this.glCanvas.addEventListener("mousemove", moveListener, false);
        this.labelCanvas.addEventListener("mousemove", moveListener, false);

        // Ad hoc key binding. TODO: Make this more abstract
        document.body.addEventListener("keydown", event => {
            if (event.code == "KeyE") {
                const minWidth = 30;
                const zoomFactor = Math.max(1, minWidth / this.sampleScale.bandwidth);
                this.fisheye = fisheye().radius(150).distortion(zoomFactor);
                focus();
            }
        }, false);

        document.body.addEventListener("keyup", event => {
            if (event.code == "KeyE") {
                this.fisheye = null;
                render();
            }
        }, false);
    }

    findSampleIdAt(point) {
        return this.sampleScale.invert(point[1]);
    }

    /**
     * TODO: Return multiple datums from overlaid layers
     * 
     * @param {number[]} point 
     */
    findDatumAt(point) {
        const [x, y] = point;

        const sampleId = this.sampleScale.invert(y);
        if (!sampleId) {
            return null;
        }

        const domainX = this.genomeSpy.rescaledX.invert(x);

        for (let layer of this.layers) {
            const datum = layer.findDatum(sampleId, domainX);
            if (datum) {
                return datum;
            }
        }

        return null;
    }

    /*
     * TODO: Multiple datums and layer-specific formatting
     */
    datumToTooltip(datum) {
        const table = '<table class="attributes"' +
            Object.entries(datum).map(([key, value]) => `
                <tr>
                    <th>${html.escapeHtml(key)}</th>
                    <td>${html.escapeHtml(value)}</td>
                </tr>`
            ).join("") +
            "</table>";
        
        return `
        <div class="sample-track-datum-tooltip">
            ${table}
        </div>`
    }

    sampleToTooltip(sample) {
        const numberFormat = d3.format(".4");

        const formatValue = value => {
            if (typeof value == "number") {
                return numberFormat(value);
            } else if (typeof value == "string") {
                return value;
            } else {
                return "";
            }
        };

        const table = '<table class="attributes"' +
            Object.entries(sample.attributes).map(([key, value]) => `
                <tr>
                    <th>${html.escapeHtml(key)}</th>
                    <td>${html.escapeHtml(formatValue(value))}</td>
                    <td class="color" style="background-color: ${this.axisArea.attributeScales.get(key)(value)}"></td>
                </tr>`
            ).join("") +
            "</table>";
        
        return `
        <div class="sample-track-sample-tooltip">
            <div class="title">
                <strong>${html.escapeHtml(sample.id)}</strong>
            </div>

            ${table}
        </div>`
    }
    

    _scaleSample(id) {
        let interval = this.sampleScale.scale(id);

        if (this.fisheye) {
            const scaleY = y => this.fisheye({ x: 0, y }).y;
            interval = interval.transform(scaleY);
        }

        return interval;
    }


    /**
     * Render the axis area, which contains labels and sample-specific attributes 
     */
    renderLabels() {
        const ctx = this.get2d(this.labelCanvas);
        ctx.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);

        this.samples.forEach(sample => {
            const band = this._scaleSample(sample.id);

            const fontSize = Math.min(this.config.fontSize, band.width());

            this.textCache.fillText(ctx,
                sample.displayName,
                this.axisArea.labelInterval.lower,
                band.centre(),
                fontSize);

            this.axisArea.attributeScales
                .forEach((valueScale, key) => {
                    ctx.fillStyle = valueScale(sample.attributes[key]);
                    ctx.fillRect(
                        this.axisArea.attributeInterval.lower + this.axisArea.attributeBandScale(key),
                        band.lower,
                        this.axisArea.attributeBandScale.bandwidth(),
                        band.width());
                });
        });
    }


    renderViewport() {
        const gl = this.gl;

        //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const width = gl.canvas.clientWidth;

        this.samples.forEach(sample => {
            const band = this._scaleSample(sample.id);

            const view = new Matrix4()
                .translate([0, band.lower, 0])
                .scale([width, band.width(), 1]);

            const uniforms = Object.assign(
                {
                    uTMatrix: this.viewportProjection.clone().multiplyRight(view),
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
            //.flatMap(sample => Object.keys(sample.attributes))
            .reduce((acc, sample) => acc.concat(Object.keys(sample.attributes)), []) // Firefox 60 ESR
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