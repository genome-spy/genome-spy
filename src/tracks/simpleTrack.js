import * as twgl from 'twgl-base.js';
import { ticks as d3ticks, max as d3max } from 'd3-array';

import formatObject from '../utils/formatObject';
import Interval from '../utils/interval';
import WebGlTrack from './webGlTrack';
import DataSource from '../data/dataSource';
import MouseTracker from '../mouseTracker';
import * as html from '../utils/html';
import PointMark from '../marks/pointMark';
import View from '../view/view';

import {
    createView,
    getFlattenedViews,
    getMarks,
    initializeViewHierarchy
} from '../view/viewUtils';


const defaultStyles = {
    height: null
}

// Based on: https://vega.github.io/vega-lite/docs/axis.html
const defaultAxisProps = {
    minExtent: 30, // TODO
    maxExtent: Infinity, // TODO
    offset: 0,

    domain: true,
    domainWidth: 1,
    domainColor: "gray",

    ticks: true,
    tickSize: 6,
    tickWidth: 1,
    tickColor: "gray",

    labels: true,
    labelPadding: 4,
    labelFont: "sans-serif",
    labelFontSize: 10,
    labelLimit: 180, // TODO
    labelColor: "black",
    /** @type { string } */
    format: null,

    titleColor: "black",
    titleFont: "sans-serif",
    titleFontSize: 10,
    titlePadding: 5
};

export default class SimpleTrack extends WebGlTrack {
    /**
     * 
     * @param {import("./../genomeSpy").default } genomeSpy 
     * @param {object} config 
     */
    constructor(genomeSpy, config) {
        super(genomeSpy, config);

        this.styles = Object.assign({}, defaultStyles, config.styles);

        const spec = /** @type {import("../view/viewUtils").Spec} */config;
        const context = {
            accessorFactory: genomeSpy.accessorFactory,
            genomeSpy, // TODO: An interface instead of a GenomeSpy
            track: this,
            getDataSource: config => new DataSource(config, genomeSpy.config.baseurl)
        };

        /** @type {View} */
        this.viewRoot = createView(spec, context);
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
     * @param {HTMLElement} trackContainer 
     */
    async initialize(trackContainer) {
        await super.initialize(trackContainer);

        this.initializeWebGL();

        this.leftCanvas = this.createCanvas();

        this.trackContainer.className = "simple-track";

        // TODO: Move to upper level
        if (typeof this.styles.height == "number") {
            this.trackContainer.style.height = `${this.styles.height}px`
        } else {
            this.trackContainer.style.flexGrow = "1";
        }

        this.viewportMouseTracker = new MouseTracker({
            element: this.glCanvas,
            tooltip: this.genomeSpy.tooltip,
            resolver: this.findDatumAndMarkAt.bind(this),
            tooltipConverter: datum => Promise.resolve(this.datumToTooltip(datum)),
            eqTest: (a, b) => (Object.is(a && a.datum, b && b.datum))
        })
            .on("dblclick", this.zoomToSpec.bind(this));


        this.genomeSpy.on("layout", layout => {
            this.resizeCanvases(layout);
            this.renderViewport();
            this.renderYAxis();
        });

        this.genomeSpy.on("zoom", () => {
            this.renderViewport();
        });

        this.genomeSpy.zoom.attachZoomEvents(
            this.glCanvas,
            point => {
                const datumAndMark = this.findDatumAndMarkAt(point);
                if (datumAndMark) {
                    const datum = datumAndMark.datum, mark = datumAndMark.mark; 
                    if (mark instanceof PointMark) {
                        // Snap the mouse cursor to the center of point marks to ease zooming
                        // TODO: Add a snap method to mark classes -> more abstract design
                        point[0] = this.genomeSpy.rescaledX(mark.encoders.x(datum));
                    }
                }
                // TODO: Support RectMarks with minWidth

                return point;
            });

        await initializeViewHierarchy(this.viewRoot);

        this.initializeGraphics();
    }


    initializeGraphics() {
        for (const mark of getMarks(this.viewRoot)) {
            mark.initializeGraphics();
        }
    }

    resizeCanvases(layout) {
        this.adjustCanvas(this.glCanvas, layout.viewport);
        this.adjustGl(this.gl);

        const trackHeight = this.trackContainer.clientHeight;
        this.adjustCanvas(this.leftCanvas, layout.axis, trackHeight);
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

    getXDomain() {
        return Interval.fromArray(this.viewRoot.resolutions["x"].getDomain());
    }

    /**
     * Returns the datum (actually the mark spec) at the specified point
     * 
     * @typedef {Object} DatumAndMark
     * @prop {object} datum
     * @prop {import("../marks/mark").default} mark
     * 
     * @param {number[]} point 
     * @returns {DatumAndMark}
     */
    findDatumAndMarkAt(point) {
        const [x, y] = point;

        const bandInterval = new Interval(0, this.glCanvas.clientHeight);

        for (const mark of getMarks(this.viewRoot).reverse()) {
            if (mark.markConfig.tooltip !== null) {
                const datum = mark.findDatum(undefined, x, y, bandInterval);
                if (datum) {
                    return { datum, mark };
                }
            }
        }
    }

    /**
     * 
     * @param {DatumAndMark} datumAndMark 
     */
    datumToTooltip(datumAndMark) {
        const datum = datumAndMark.datum;
        const mark = datumAndMark.mark;

        const markConfig = mark.markConfig;
        const propertyFilter = markConfig && markConfig.tooltip && markConfig.tooltip.skipFields ?
            entry => markConfig.tooltip.skipFields.indexOf(entry[0]) < 0 :
            entry => true;

        /**
         * @param {string} key
         * @param {object} datum
         */
        function legend(key, datum) {
            for (const [channel, encoder] of Object.entries(mark.encoders)) {
                if (encoder.accessor && encoder.accessor.fields.includes(key)) {
                    switch (channel) {
                        case "color":
                            return `<span class="color-legend" style="background-color: ${encoder(datum)}"></span>`;
                        default:
                    }
                }
            }

            return "";
        } 

        const table = '<table class="attributes"' +
            Object.entries(datum).filter(propertyFilter).map(([key, value]) => `
                <tr>
                    <th>${html.escapeHtml(key)}</th>
                    <td>${html.escapeHtml(formatObject(value))} ${legend(key, datum)}</td>
                </tr>`
            ).join("") +
            "</table>";

        const title = mark.unitView.spec.title ?
            `<div class="title"><strong>${html.escapeHtml(mark.unitView.spec.title)}</strong></div>` :
            "";
        
        return `
        ${title}
        <div class="sample-track-datum-tooltip">
            ${table}
        </div>`
    }


    renderViewport() {
        const gl = this.gl;

        //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const globalUniforms = {
            ...this.getDomainUniforms(),
            zoomLevel: this.genomeSpy.getExpZoomLevel()
        };

        const samples = [
            {
                sampleId: "default",
                uniforms: {
                    yPosLeft: [0, 1],
                    yPosRight: [0, 1]
                }
            }
        ]

        for (const mark of getMarks(this.viewRoot)) {
            mark.render(samples, globalUniforms)
        }
    }


    getMinAxisWidth() {
        // This function is terribly copypasted from renderYAxis().
        // TODO: Have to come up with a more maintainable and perhaps more performant solution.

        const axisPadding = 10;

        const axisHeight = this.trackContainer.clientHeight;

        const ctx = this.get2d(this.leftCanvas);
        const resolutions = getFlattenedViews(this.viewRoot)
            .map(view => view.resolutions["y"])
            .filter(resolution => resolution);

        let xPos = 0;

        for (const resolution of resolutions) {
            const resolutionAxisProps = resolution.getAxisProps();
            if (resolutionAxisProps === null) {
                continue;
            }

            const props = {
                ...defaultAxisProps,
                ...resolutionAxisProps
            };

            xPos -= props.offset;

            const domain = resolution.getDomain();

            const scale = resolution.getScale()
                .copy()
                .range([this.trackContainer.clientHeight, 0]);

            // Slightly decrease the tick density as the height increases
            const tickCount = Math.round(axisHeight / Math.exp(axisHeight / 800) / props.labelFontSize / 1.7);

            /** @type {array} */
            const ticks = scale.ticks ? scale.ticks(tickCount) : scale.domain();

            // --- Ticks ---

            if (props.ticks) {
                xPos -= props.tickSize;
            }

            // --- Labels ---

            if (props.labels) {
                xPos -= props.labelPadding;

                const maxAbs = d3max(scale.domain(), x => Math.abs(x));
                const format = scale.tickFormat ?
                    scale.tickFormat(tickCount, props.format || (maxAbs < 0.001 || maxAbs > 100000 ? "s" : undefined)) :
                    value => value;

                ctx.font = `${props.labelFont} ${props.labelFontSize}px`;
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";

                xPos -= ticks
                    .map(tick => ctx.measureText(format(tick)).width)
                    .reduce((a, b) => Math.max(a, b));
            }

            // --- Title ---

            const titleText = resolution.getTitle();

            if (titleText) {
                xPos -= props.titlePadding;
                xPos -= props.titleFontSize;
            }

            xPos -= axisPadding;
        }

        return -xPos - axisPadding;
    }

    renderYAxis() {

        /** Padding between multiple axes */
        const axisPadding = 10;

        const axisHeight = this.trackContainer.clientHeight;
        const axisWidth = this.leftCanvas.clientWidth;

        const ctx = this.get2d(this.leftCanvas);

        const resolutions = getFlattenedViews(this.viewRoot)
            .map(view => view.resolutions["y"])
            .filter(resolution => resolution);

        let xPos = axisWidth;

        for (const resolution of resolutions) {
            const resolutionAxisProps = resolution.getAxisProps();
            if (resolutionAxisProps === null) {
                continue;
            }

            const props = {
                ...defaultAxisProps,
                ...resolutionAxisProps
            };

            xPos -= props.offset;

            const scale = resolution.getScale()
                .copy()
                .range([this.trackContainer.clientHeight, 0]);

            // Slightly decrease the tick density as the height increases
            const tickCount = Math.round(axisHeight / Math.exp(axisHeight / 800) / props.labelFontSize / 1.7);

            /** @type {array} */
            const ticks = scale.ticks ? scale.ticks(tickCount) : scale.domain();

            // --- Domain line ---

            if (props.domain) {
                ctx.fillStyle = props.domainColor;
                ctx.fillRect(
                    xPos - props.domainWidth,
                    scale(ticks[ticks.length - 1]) - props.tickWidth / 2,
                    props.domainWidth,
                    Math.abs(scale(ticks[0]) - scale(ticks[ticks.length - 1])) + props.tickWidth);
            }

            const tickOffset = (scale.bandwidth && scale.bandwidth() || 0) / 2;

            // --- Ticks ---

            if (props.ticks) {
                xPos -= props.tickSize;

                for (const tick of ticks) {
                    const y = scale(tick) + tickOffset;
                    ctx.fillStyle = props.tickColor;
                    ctx.fillRect(xPos, y - props.tickWidth / 2, props.tickSize, props.tickWidth);
                }
            }

            // --- Labels ---

            if (props.labels) {
                xPos -= props.labelPadding;

                const maxAbs = d3max(scale.domain(), x => Math.abs(x));

                const format = scale.tickFormat ?
                    scale.tickFormat(tickCount, props.format || (maxAbs < 0.001 || maxAbs > 100000 ? "s" : undefined)) :
                    value => value;

                ctx.font = `${props.labelFont} ${props.labelFontSize}px`;
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";

                for (const tick of ticks) {
                    const y = scale(tick) + tickOffset;
                    ctx.fillStyle = props.labelColor;
                    ctx.fillText(format(tick), xPos, y);
                }

                xPos -= ticks
                    .map(tick => ctx.measureText(format(tick)).width)
                    .reduce((a, b) => Math.max(a, b));
            }


            // --- Title ---

            const titleText = resolution.getTitle();

            if (titleText) {
                xPos -= props.titlePadding;
                xPos -= props.titleFontSize;

                ctx.save();

                ctx.translate(xPos, axisHeight / 2);
                ctx.rotate(-Math.PI / 2);

                ctx.fillStyle = props.titleColor;

                ctx.font = `${props.titleFont} ${props.titleFontSize}px`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";

                ctx.fillText(titleText, 0, 0);

                ctx.restore();
            }

            xPos -= axisPadding;

        }
    }
}