import {
    setParameters, fp64, createGLContext, registerShaderModules
} from 'luma.gl';
import * as d3 from 'd3';
import WebGlTrack from '../webGlTrack';
import BandScale from '../../utils/bandScale';
import MouseTracker from "../../mouseTracker";
import Interval from '../../utils/interval';
import * as html from "../../utils/html";
import fisheye from "../../utils/fishEye";
import transition, { easeLinear, normalizedEase, easeInOutQuad, easeInOutSine } from "../../utils/transition";
import AttributePanel from './attributePanel';

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
 * 
 * @typedef {Object} Sample
 * @prop {string} id
 * @prop {string} displayName
 * @prop {Object[]} attributes
 */
export default class SampleTrack extends WebGlTrack {

    constructor(samples, layers) {
        super();

        this.config = defaultConfig;

        /**
         * An array of sample objects. Their order stays constant.
         * Properties: id, displayName, attributes. Data contains arbitrary sample-specific
         * attributes, e.g. clinical data.
         * 
         * @type {Sample[]}
         */
        this.samples = samples;

        /**
         * A mapping that specifies the order of the samples.
         * 
         * @type {string[]}
         */
        this.sampleOrder = this.getSamplesSortedByAttribute(s => s.displayName);

        /**
         * // TODO: layer base class
         * @type {import("../../layers/segmentLayer").default[]}
         */
        this.layers = layers;

        this.attributePanel = new AttributePanel(this);
    }

    /**
     * Returns the minimum width that accommodates the labels on the Y axis.
     * The axis area of sampleTrack contains sample labels and sample-specific
     * attributes.
     * 
     * @returns {number} The width
     */
    getMinAxisWidth() {
        return this.attributePanel.getMinWidth();
    }

    resizeCanvases(layout) {
        const trackHeight = this.trackContainer.clientHeight;

        this.adjustCanvas(this.glCanvas, layout.viewport);
        this.adjustGl(this.gl);

        this.sampleScale.range([0, trackHeight]);

        this.attributePanel.resizeCanvases(layout.axis);
    }

    /**
     * @param {import("../../genomeSpy").default} genomeSpy 
     * @param {HTMLElement} trackContainer 
     */
    initialize(genomeSpy, trackContainer) {
        super.initialize(genomeSpy, trackContainer);

        this.sampleScale = new BandScale();
        this.sampleScale.domain(this.sampleOrder);
        this.sampleScale.paddingInner = this.config.paddingInner;
        this.sampleScale.paddingOuter = this.config.paddingOuter;

        this.trackContainer.className = "sample-track";

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


        this.attributePanel.initialize();
        this.initializeFisheye()


        genomeSpy.on("layout", layout => {
            this.resizeCanvases(layout);
            this.attributePanel.renderLabels();
            this.attributePanel.renderAttributeLabels();
            this.renderViewport();
        });

        genomeSpy.on("zoom", () => {
            this.renderViewport();
        });

        genomeSpy.zoom.attachZoomEvents(this.glCanvas);


        // TODO: Reorganize:
        document.body.addEventListener("keydown", event => {
            if (event.key >= '1' && event.key <= '9') {
                const index = event.key.charCodeAt(0) - '1'.charCodeAt(0);
                this.sortSamples(s => Object.values(s.attributes)[index]);
            }
        });

        this.glCanvas.addEventListener("mousedown", event => {
            if (event.metaKey) {
                const point = d3.clientPoint(this.glCanvas, event);
                const pos = this.genomeSpy.rescaledX.invert(point[0])

                this.sortSamplesByLocus(this.layers[0], pos);
            }
        }, false);
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
            this.attributePanel.renderLabels();
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
        this.attributePanel.labelCanvas.addEventListener("mousemove", moveListener, false);

        const minWidth = 30;
        const zero = 0.01
        let zoomFactor = zero;

        // Ad hoc key binding. TODO: Make this more abstract
        document.body.addEventListener("keydown", event => {
            if (!event.repeat && event.code == "KeyE") {
                this.fisheye = fisheye().radius(150);

                transition({
                    duration: 150,
                    from: zero,
                    to: Math.max(1, minWidth / this.sampleScale.bandwidth),
                    //easingFunction: easeOutElastic,
                    onUpdate: value => {
                        this.fisheye.distortion(value);
                        zoomFactor = value;
                        focus();
                    }
                });
            }
        }, false);

        document.body.addEventListener("keyup", event => {
            if (event.code == "KeyE") {
                transition({
                    duration: 100,
                    from: zoomFactor,
                    to: zero,
                    onUpdate: value => {
                        this.fisheye.distortion(value);
                        zoomFactor = value;
                        focus();
                    }
                }).then(() => {
                    this.fisheye = null;
                    render();
                });
            }
        }, false);
    }

    findSampleAt(point) {
        const sampleId = this.sampleScale.invert(point[1]);
        return sampleId ? this.samples.find(s => s.id == sampleId) : null;
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

    

    _scaleSample(id) {
        let interval = this.sampleScale.scale(id);

        if (this.fisheye) {
            const scaleY = y => this.fisheye({ x: 0, y }).y;
            interval = interval.transform(scaleY);
        }

        return interval;
    }


    /**
     * 
     * @param {object} layer
     * @param {number} pos locus in continuous domain
     */
    sortSamplesByLocus(layer, pos) {
        const valuesBySample = new Map(this.sampleOrder.map(id => [
            id,
            +layer.findDatum(id, pos).segMean // TODO: Generify
        ]));

        const accessor = sample => valuesBySample.get(sample.id);

        this.sortSamples(accessor);

    }

    /**
     * 
     * @param {function(Sample):number} attributeAccessor 
     */
    sortSamples(attributeAccessor) {
        this.updateSamples(this.getSamplesSortedByAttribute(attributeAccessor));
    }

    /**
     * Updates the visible set of samples. Animates the transition.
     *
     * @param {string[]} sampleIds 
     */
    updateSamples(sampleIds) {
        const targetSampleScale = this.sampleScale.clone();
        targetSampleScale.domain(sampleIds);

        const yDelay = d3.scaleLinear().domain([0, 0.4]).clamp(true);
        const xDelay = d3.scaleLinear().domain([0.15, 1]).clamp(true);

        const yEase = normalizedEase(easeInOutQuad);
        const xEase = normalizedEase(easeInOutSine);

        this.attributePanel.sampleMouseTracker.clear();
        this.viewportMouseTracker.clear();

        transition({
            duration: 1200,
            easingFunction: easeLinear,
            onUpdate: value => {
                const samplePositionResolver = id => this.sampleScale.scale(id)
                    .mix(targetSampleScale.scale(id), yEase(yDelay(value)));
                
                /** @type {RenderOptions} */
                const options = {
                    samplePositionResolver,
                    transitionProgress: xEase(xDelay(value))
                };

                this.renderViewport(options);
                this.attributePanel.renderLabels(options);

                
            }
        }).then(() => {
            this.sampleOrder = sampleIds;
            this.sampleScale = targetSampleScale;
            this.renderViewport();
            this.attributePanel.renderLabels();
        });

    }


    /**
     * 
     * @param {function} attributeAccessor
     * @returns {string[]} ids of sorted samples 
     */
    getSamplesSortedByAttribute(attributeAccessor) {
        // TODO: use a stable sorting algorithm, sort based on the current order
        return [...this.samples].sort((a, b) => {
            const av = attributeAccessor(a);
            const bv = attributeAccessor(b);

            if (av < bv) {
                return -1;
            } else if (av > bv) {
                return 1;
            } else {
                return 0;
            }
        }).map(s => s.id);
    }


    /**
     * 
     * @typedef {Object} RenderOptions
     * @property {function(string):Interval} samplePositionResolver
     * @property {number} transitionProgress
     * 
     * @param {RenderOptions} [options] 
     */
    renderViewport(options) {
        const gl = this.gl;

        // Normalize to [0, 1]
        const normalize = d3.scaleLinear()
            .domain([0, gl.canvas.clientHeight]);
        
        const positionResolver = (options && options.samplePositionResolver) || (id => this._scaleSample(id));
        const transitionProgress = (options && options.transitionProgress) || 0;

        //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clear(gl.COLOR_BUFFER_BIT);

        this.samples.forEach(sample => {
            const bandLeft = positionResolver(sample.id).transform(normalize);
            const bandRight = this._scaleSample(sample.id).transform(normalize);

            const uniforms = Object.assign(
                {
                    yPosLeft: [bandLeft.lower, bandLeft.width()],
                    yPosRight: [bandRight.lower, bandRight.width()],
                    transitionOffset: transitionProgress
                },
                this.getDomainUniforms()
            );

            this.layers.forEach(layer => layer.render(sample.id, uniforms));
        });
    }


}