import {
    setParameters, fp64, createGLContext, registerShaderModules
} from 'luma.gl';
import * as d3 from 'd3';
import WebGlTrack from '../webGlTrack';
import BandScale from '../../utils/bandScale';
import MouseTracker from "../../mouseTracker";
import * as html from "../../utils/html";
import fisheye from "../../utils/fishEye";
import transition, { easeLinear, normalizedEase, easeInOutQuad, easeInOutSine } from "../../utils/transition";
import AttributePanel from './attributePanel';
import { shallowArrayEquals } from '../../utils/arrayUtils';

const defaultConfig = {
    paddingInner: 0.20, // Relative to sample height
    paddingOuter: 0.20,

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
 * @prop {Object[]} attributes Arbitrary sample specific attributes
 */
export default class SampleTrack extends WebGlTrack {

    constructor(samples, layers) {
        super();

        this.config = defaultConfig;

        /**
         * A map of sample objects
         * 
         * @type {Map<string, Sample>}
         */
        this.samples = new Map(samples.map(sample => [sample.id, sample]));

        /**
         * A mapping that specifies the order of the samples.
         * 
         * TODO: Implement "SampleManager" with ordering, filtering and unit tests
         * 
         * @type {string[]}
         */
        this.sampleOrder = samples.map(s => s.id);

        /**
         * Keep track of sample set mutations.
         * TODO: Consider Redux
         * 
         * @type {string[][]}
         */
        this.sampleOrderHistory = [[...this.sampleOrder]];

        /**
         * // TODO: layer base class
         * @type {import("../../layers/segmentLayer").default[]}
         */
        this.layers = layers;

        this.attributePanel = new AttributePanel(this);

        /**
         * Global transform for y axis (Samples)
         * 
         * @type {?function(number):number}
         */
        this.yTransform = null;
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

        /** @type {BandScale} */
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

            } else if (event.code == "Backspace") {
                this.backtrackSamples();
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
     */
    initializeFisheye() {
        /** @type {MouseEvent} */
        let lastMouseEvent = null;
        let persistentFisheye = false;

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

        this.genomeSpy.container.addEventListener("mousemove", moveListener);

        const minWidth = 30;
        const zero = 0.01
        let zoomFactor = zero;

        const closeFisheye = () => {
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
                this.yTransform = null;
                render();
            });
        };

        const openFisheye = () => {
            this.fisheye = fisheye().radius(150);

            this.yTransform = y => this.fisheye({ x: 0, y }).y;

            transition({
                duration: 150,
                from: zero,
                to: Math.max(1, minWidth / this.sampleScale.getBandWidth()),
                //easingFunction: easeOutElastic,
                onUpdate: value => {
                    this.fisheye.distortion(value);
                    zoomFactor = value;
                    focus();
                }
            });

        };

        // Ad hoc key binding. TODO: Make this more abstract
        document.body.addEventListener("keydown", event => {
            if (!event.repeat && event.code == "KeyE") {
                if (!persistentFisheye) {
                    openFisheye();
                    persistentFisheye = event.shiftKey;

                } else if (event.shiftKey) {
                    closeFisheye();
                    persistentFisheye = false;

                } else {
                    persistentFisheye = false;
                }
            }
        });

        document.body.addEventListener("keyup", event => {
            if (event.code == "KeyE" && this.fisheye && !persistentFisheye && !event.shiftKey) {
                closeFisheye();
            }
        });
    }

    findSampleAt(point) {
        // If space between bands get too small, find closest to make opening
        // of the context menu easier
        const findClosest = this.sampleScale.getRange().width() /
            this.sampleScale.getDomain().length * this.sampleScale.paddingOuter < 2.5;

        const sampleId = this.sampleScale.invert(point[1], findClosest);
        return sampleId ? this.samples.get(sampleId) : null;
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
        let sortedSampleIds = this.getSamplesSortedByAttribute(attributeAccessor, false);

        if (shallowArrayEquals(sortedSampleIds, this.sampleOrder)) {
            sortedSampleIds = this.getSamplesSortedByAttribute(attributeAccessor, true);
        }

        this.updateSamples(sortedSampleIds);
    }


    backtrackSamples() {
        if (this.sampleOrderHistory.length > 1) {
            this.sampleOrderHistory.pop();

            const sampleIds = this.sampleOrderHistory[this.sampleOrderHistory.length - 1];

            const targetSampleScale = this.sampleScale.clone();
            targetSampleScale.domain(sampleIds);

            this.animateSampleTransition(this.sampleScale, targetSampleScale, true)
                .then(() => {
                    this.sampleOrder = sampleIds;
                    this.sampleScale = targetSampleScale;
                    this.renderViewport();
                    this.attributePanel.renderLabels();
                });
        }
    }
    
    /**
     * Updates the visible set of samples. Animates the transition.
     *
     * @param {string[]} sampleIds 
     */
    updateSamples(sampleIds) {

        // Do nothing if new samples equals the old samples
        if (shallowArrayEquals(sampleIds,
            this.sampleOrderHistory[this.sampleOrderHistory.length - 1])) {
            return;
        }

        // If new samples appear to reverse the last action, backtrack in history
        if (this.sampleOrderHistory.length > 1 &&
            shallowArrayEquals(sampleIds,
            this.sampleOrderHistory[this.sampleOrderHistory.length - 2])) {
            this.sampleOrderHistory.pop();

        } else {
            this.sampleOrderHistory.push(sampleIds);
        }


        const targetSampleScale = this.sampleScale.clone();
        targetSampleScale.domain(sampleIds);

        this.animateSampleTransition(this.sampleScale, targetSampleScale)
            .then(() => {
                this.sampleOrder = sampleIds;
                this.sampleScale = targetSampleScale;
                this.renderViewport();
                this.attributePanel.renderLabels();
            });
    }

    /**
     * @param {BandScale} from 
     * @param {BandScale} to 
     * @param {boolean} reverse 
     */
    animateSampleTransition(from, to, reverse = false) {

        from = this.addCollapsedBands(to, from);
        to = this.addCollapsedBands(from, to);

        if (reverse) {
            [from, to] = [to, from];
        }

        const yDelay = d3.scaleLinear().domain([0, 0.4]).clamp(true);
        const xDelay = d3.scaleLinear().domain([0.15, 1]).clamp(true);

        const yEase = normalizedEase(easeInOutQuad);
        const xEase = normalizedEase(easeInOutSine);

        this.attributePanel.sampleMouseTracker.clear();
        this.viewportMouseTracker.clear();

        return transition({
            from: reverse ? 1 : 0,
            to: reverse ? 0 : 1,
            duration: reverse ? 500 : 1200,
            easingFunction: easeLinear,
            onUpdate: value => {
                //const samplePositionResolver = id => from.scale(id)
                //    .mix(to.scale(id), yEase(yDelay(value)));

                //const easingFunction = value => yEase(yDelay(value))
                
                /** @type {RenderOptions} */
                const options = {
                    leftScale: from,
                    rightScale: to,
                    yTransitionProgress: yEase(yDelay(value)),
                    xTransitionProgress: xEase(xDelay(value))
                };

                this.renderViewport(options);
                this.attributePanel.renderLabels(options);
            }
        });
    }

    /**
     * Adds missing keys to the target scale as collapsed bands
     * 
     * @param {BandScale} source A scale that contains additional keys missing from the target
     * @param {BandScale} target The scale that will be supplemented with collapsed bands
     */
    addCollapsedBands(source, target) {
        const targetDomain = [...target.getDomain()];
        const targetWidths = Array(targetDomain.length).fill(1); // TODO: get from target

        let lastInsertionPoint = -1;

        // This is O(n^2), which may be a problem with gigantic sample sets

        for (let key of source.getDomain()) {
            const targetIndex = targetDomain.indexOf(key);
            if (targetIndex >= 0) {
                lastInsertionPoint = targetIndex;

            } else {
                lastInsertionPoint++;
                targetDomain.splice(lastInsertionPoint, 0, key);
                targetWidths.splice(lastInsertionPoint, 0, 0);
            }
        }

        const supplementedScale = target.clone();
        supplementedScale.domain(targetDomain, targetWidths);
        return supplementedScale;
    }


    /**
     * 
     * @param {function} attributeAccessor
     * @param {boolean} [descending]
     * @returns {string[]} ids of sorted samples 
     */
    getSamplesSortedByAttribute(attributeAccessor, descending = false) {
        // TODO: use a stable sorting algorithm
        return [...this.sampleOrder].sort((a, b) => {
            let av = attributeAccessor(this.samples.get(a));
            let bv = attributeAccessor(this.samples.get(b));

            if (descending) {
                [av, bv] = [bv, av];
            }

            if (av < bv) {
                return -1;
            } else if (av > bv) {
                return 1;
            } else {
                return 0;
            }
        });
    }


    /**
     * 
     * @typedef {Object} RenderOptions
     * @property {BandScale} leftScale
     * @property {BandScale} rightScale
     * @property {number} yTransitionProgress
     * @property {number} xTransitionProgress
     * 
     * @param {RenderOptions} [options] 
     */
    renderViewport(options) {
        const gl = this.gl;

        // Normalize to [0, 1]
        const normalize = d3.scaleLinear()
            .domain([0, gl.canvas.clientHeight]);
        
        const leftScale = (options && options.leftScale) || this.sampleScale
        const rightScale = (options && options.rightScale) || this.sampleScale
        const xTransitionProgress = (options && options.xTransitionProgress) || 0;
        const yTransitionProgress = (options && options.yTransitionProgress) || 0;

        //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clear(gl.COLOR_BUFFER_BIT);

        leftScale.getDomain().forEach(sampleId => {
            const bandLeft = leftScale.scale(sampleId)
                .mix(rightScale.scale(sampleId), yTransitionProgress)
                .transform(this.yTransform)
                .transform(normalize);

            const bandRight = leftScale.scale(sampleId)
                .transform(this.yTransform)
                .transform(normalize);

            const uniforms = Object.assign(
                {
                    yPosLeft: [bandLeft.lower, bandLeft.width()],
                    yPosRight: [bandRight.lower, bandRight.width()],
                    transitionOffset: xTransitionProgress
                },
                this.getDomainUniforms()
            );

            this.layers.forEach(layer => layer.render(sampleId, uniforms));
        });
    }
}