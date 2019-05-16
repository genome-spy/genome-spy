import * as twgl from 'twgl-base.js';
import { scaleLinear } from 'd3-scale';
import { format as d3format } from 'd3-format';
import { zip } from 'd3-array';
import * as dl from 'datalib';

import WebGlTrack from '../webGlTrack';
import BandScale from '../../utils/bandScale';
import MouseTracker from "../../mouseTracker";
import * as html from "../../utils/html";
import fisheye from "../../utils/fishEye";
import transition, { easeLinear, normalizedEase, easeInOutQuad, easeInOutSine } from "../../utils/transition";
import clientPoint from "../../utils/point";
import AttributePanel from './attributePanel';
import { shallowArrayEquals } from '../../utils/arrayUtils';
import ViewUnit from '../../layers/viewUnit';
import DataSource from '../../data/dataSource';
import contextMenu from '../../contextMenu';
import Interval from '../../utils/interval';

const defaultStyles = {
    paddingInner: 0.20, // Relative to sample height
    paddingOuter: 0.20,

    attributeWidth: 12, // in pixels
    attributePaddingInner: 0.05,

    naColor: "#D0D0D0",

    fontSize: 12,
    fontFamily: "sans-serif",

    horizontalSpacing: 10, // TODO: Find a better place

    height: null // Use "flex-grow: 1" if no height has been specified
}


function extractAttributes(row) {
    const attributes = Object.assign({}, row);
    delete attributes.sample;
    delete attributes.displayName;
    return attributes;
}

/**
 * @param {any[]} flatSamples 
 */
function processSamples(flatSamples) {
    return flatSamples 
        .map(row => ({
            id: row.sample,
            displayName: row.displayName || row.sample,
            attributes: extractAttributes(row)
        }));
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

    /**
     * 
     * @param {import("../../genomeSpy").default } genomeSpy 
     * @param {object | import("../../layers/viewUnit").ViewUnitConfig} config 
     */
    constructor(genomeSpy, config) {
        super(genomeSpy, config);

        this.styles = Object.assign({}, defaultStyles, config.styles);

        this.attributePanel = new AttributePanel(this);

        /**
         * Global transform for y axis (Samples)
         * 
         * @type {?function(number):number}
         */
        this.yTransform = null;


        this.viewUnit = new ViewUnit(
            {
                genomeSpy,
                sampleTrack: this,
                getDataSource: config => new DataSource(config, genomeSpy.config.baseurl)
            },
           undefined,
           config
        );
    }


    /**
     * 
     * @param {Sample[]} samples 
     */
    setSamples(samples) {
        // TODO: Support dynamic configuration

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
     * @param {HTMLElement} trackContainer 
     */
    async initialize(trackContainer) {
        await super.initialize(trackContainer);

        this.trackContainer.className = "sample-track";

        // TODO: Move to upper level
        if (typeof this.styles.height == "number") {
            this.trackContainer.style.height = `${this.styles.height}px`
        } else {
            this.trackContainer.style.flexGrow = "1";
        }

        if (this.config.samples) {
            const sampleDataSource = new DataSource(this.config.samples.data, this.genomeSpy.config.baseurl);
            this.setSamples(processSamples(await sampleDataSource.getUngroupedData()));

        } else {
            // TODO: Get samples from layers if they were not provided
            throw new Error("No samples defined!");
        }

        /** @type {BandScale} */
        this.sampleScale = new BandScale();
        this.sampleScale.domain(this.sampleOrder);
        this.sampleScale.paddingInner = this.styles.paddingInner;
        this.sampleScale.paddingOuter = this.styles.paddingOuter;

        this.initializeWebGL();

        await this.viewUnit.initialize();

        this.viewportMouseTracker = new MouseTracker({
            element: this.glCanvas,
            tooltip: this.genomeSpy.tooltip,
            resolver: this.findDatumAt.bind(this),
            tooltipConverter: datum => Promise.resolve(this.datumToTooltip(datum))
        })
            .on("contextmenu", this.createContextMenu.bind(this))
            .on("dblclick", this.zoomToSpec.bind(this));


        this.attributePanel.initialize();
        this.initializeFisheye()


        this.genomeSpy.on("layout", layout => {
            this.resizeCanvases(layout);
            this.attributePanel.renderLabels();
            this.attributePanel.renderAttributeLabels();
            this.renderViewport();
        });

        this.genomeSpy.on("zoom", () => {
            this.renderViewport();
        });

        this.genomeSpy.zoom.attachZoomEvents(this.glCanvas);


        // TODO: Reorganize:
        document.body.addEventListener("keydown", event => {
            if (event.key >= '1' && event.key <= '9') {
                const index = event.key.charCodeAt(0) - '1'.charCodeAt(0);
                this.sortSamples(s => Object.values(s.attributes)[index]);

            } else if (event.code == "Backspace") {
                this.backtrackSamples();
            }
        });

        // TODO: Make generic, use context-menu etc...
        /*
        this.glCanvas.addEventListener("mousedown", event => {
            if (event.ctrlKey) {
                const point = clientPoint(this.glCanvas, event);
                const pos = this.genomeSpy.rescaledX.invert(point[0])

                this.sortSamplesByLocus(this.layers[0], pos, event.shiftKey ? "bafMean" : "segMean");
            }
        }, false);
        */
    }

    initializeWebGL() {
        // Canvas for WebGL
        this.glCanvas = this.createCanvas();

        const gl = twgl.getContext(this.glCanvas);

        this.gl = gl;

        gl.clearColor(1, 1, 1, 1);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
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
            this.fisheye.focus([0, clientPoint(this.glCanvas, lastMouseEvent)[1]]);
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

    
    zoomToSpec(spec, mouseEvent, point) {
        // TODO: handle case: x = 0
        if (spec.x && spec.x2) {
            const interval = new Interval(spec.x, spec.x2);
            this.genomeSpy.zoomTo(interval.pad(interval.width() * 0.25));

        } else if (spec.x && !spec.x2) {
            const width = 1000000; // TODO: Configurable

            this.genomeSpy.zoomTo(new Interval(spec.x - width / 2, spec.x + width / 2));
        }
    }

    /**
     * Returns all marks in the order they are rendered
     */
    getLayers() {
        /** @type {import("../../layers/mark").default[]} */
        const layers = [];
        this.viewUnit.visit(vu => {
            if (vu.mark) {
                layers.push(vu.mark);
            }
        });
        return layers;
    }

    /**
     * Returns the datum (actually the mark spec) at the specified point
     * 
     * @param {number[]} point 
     */
    findDatumAt(point) {
        const [x, y] = point;

        const sampleId = this.sampleScale.invert(y);
        if (!sampleId) {
            return null;
        }

        const bandInterval = this.sampleScale.scale(sampleId);

        for (const mark of this.getLayers().reverse()) {
            if (mark.markConfig.tooltip !== null) {
                const spec = mark.findDatum(sampleId, x, y, bandInterval);
                if (spec) {
                    return spec;
                }
            }
        }

        return null;
    }

    datumToTooltip(spec) {
        const numberFormat = d3format(".4~r");

        const datum = spec.rawDatum;

        /** @type {ViewUnit} */
        const viewUnit = spec._viewUnit;

        const markConfig = viewUnit.mark.markConfig;
        const propertyFilter = markConfig.tooltip && markConfig.tooltip.skipFields ?
            entry => markConfig.tooltip.skipFields.indexOf(entry[0]) < 0 :
            entry => true;

        function toString(object) {
            if (typeof object == "string") {
                return object.substring(0, 30);

            } else if (typeof object == "number") {
                return numberFormat(object);

            } else if (object === null) {
                return "";

            } else {
                return "?" + typeof object;
            }
        }

        function legend(key, datum) {
            const mapper = viewUnit.mark.fieldMappers && viewUnit.mark.fieldMappers[key];

            if (mapper && mapper.targetType == "color") {
                return `<span class="color-legend" style="background-color: ${mapper(datum)}"></span>`;
            }
            
            return "";
        } 

        const table = '<table class="attributes"' +
            Object.entries(datum).filter(propertyFilter).map(([key, value]) => `
                <tr>
                    <th>${html.escapeHtml(key)}</th>
                    <td>${html.escapeHtml(toString(value))} ${legend(key, datum)}</td>
                </tr>`
            ).join("") +
            "</table>";

        const title = viewUnit.config.title ?
            `<div class="title"><strong>${html.escapeHtml(viewUnit.config.title)}</strong></div>` :
            "";
        
        return `
        ${title}
        <div class="sample-track-datum-tooltip">
            ${table}
        </div>`
    }

    /**
     * 
     * @param {object} sample 
     * @param {MouseEvent} mouseEvent 
     */
    createContextMenu(datum, mouseEvent, point) {

        /** @type {import("../../contextMenu").MenuItem[]} */
        let items = [];
        
        const scaledX = this.genomeSpy.rescaledX.invert(point[0]);

        for (const mark of this.getLayers()) {
            if (mark.markConfig && mark.markConfig.sorting) {
                items.push({
                    label: mark.viewUnit.config.title || "- No title -", 
                    type: "header"
                });

                for (const field of mark.markConfig.sorting.fields) {
                    items.push({
                        label: `Sort by ${field}`,
                        callback: () => this.sortSamplesByLocus(mark, scaledX, field)
                    });
                }
            }
        }
    
        contextMenu({ items }, mouseEvent);
    }

    /**
     * 
     * @param {number} pos locus in continuous domain
     */
    sortSamplesByLocus(mark, pos, attribute) {
        const getAttribute = d => d ? d[attribute] : undefined;

        const values = this.sampleOrder.map(id => getAttribute(mark.findDatumAt(id, pos)));

        // nulls & undefineds break sorting
        const sanitize = dl.type(values) == "number" ?
            (d => dl.isValid(d) ? d : -Infinity) :
            (d => dl.isValid(d) ? d : "")

        const valuesBySample = new Map(zip(this.sampleOrder, values.map(sanitize)));

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

        const yDelay = scaleLinear().domain([0, 0.4]).clamp(true);
        const xDelay = scaleLinear().domain([0.15, 1]).clamp(true);

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
        const replaceNaN = x => (typeof x == "number" && isNaN(x)) ? -Infinity : x === null ? "" : x;

        return [...this.sampleOrder].sort((a, b) => {
            let av = replaceNaN(attributeAccessor(this.samples.get(a)));
            let bv = replaceNaN(attributeAccessor(this.samples.get(b)));


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
        const normalize = scaleLinear()
            .domain([0, gl.canvas.clientHeight]);
        
        const leftScale = (options && options.leftScale) || this.sampleScale
        const rightScale = (options && options.rightScale) || this.sampleScale
        const xTransitionProgress = (options && options.xTransitionProgress) || 0;
        const yTransitionProgress = (options && options.yTransitionProgress) || 0;

        //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const globalUniforms = {
            ...this.getDomainUniforms(),
            transitionOffset: xTransitionProgress,
            zoomLevel: this.genomeSpy.getExpZoomLevel()
        };

        const samples = leftScale.getDomain().map(sampleId => {
            const bandLeft = leftScale.scale(sampleId)
                .mix(rightScale.scale(sampleId), yTransitionProgress)
                .transform(this.yTransform)
                .transform(normalize);

            const bandRight = leftScale.scale(sampleId)
                .transform(this.yTransform)
                .transform(normalize);

            return {
                sampleId,
                uniforms: {
                    yPosLeft: [bandLeft.lower, bandLeft.width()],
                    yPosRight: [bandRight.lower, bandRight.width()],
                }
            };
        });

        this.viewUnit.visit(vu => {
            if (vu.mark) {
                vu.mark.render(samples, globalUniforms)
            }
        });
    }
}