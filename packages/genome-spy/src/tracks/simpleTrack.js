import formatObject from "../utils/formatObject";
import Interval from "../utils/interval";
import WebGlTrack from "./webGlTrack";
import MouseTracker from "../mouseTracker";
import * as html from "../utils/html";
import PointMark from "../marks/pointMark";
import { validTicks, tickValues, tickFormat, tickCount } from "../scale/ticks";
import { getFlattenedViews, getMarks, initializeData } from "../view/viewUtils";
import UnitView from "../view/unitView";

const defaultStyles = {
    height: null
};

// Based on: https://vega.github.io/vega-lite/docs/axis.html
/** @type { import("../spec/axis").Axis} */
const defaultAxisProps = {
    /** @type {number[] | string[] | boolean[]} */
    values: null,

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

    /** @type {number} */
    tickCount: null,
    /** @type {number} */
    tickMinStep: null,

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
     * @param {import("../view/view").default} view
     */
    constructor(genomeSpy, config, view) {
        super(genomeSpy, config);

        this.styles = Object.assign({}, defaultStyles, config.styles);
        this.view = view;
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
            this.trackContainer.style.height = `${this.styles.height}px`;
        } else {
            this.trackContainer.style.flexGrow = "1";
        }

        this.viewportMouseTracker = new MouseTracker({
            element: this.glCanvas,
            tooltip: this.genomeSpy.tooltip,
            resolver: this.findDatumAndMarkAt.bind(this),
            tooltipConverter: datum =>
                Promise.resolve(this.datumToTooltip(datum)),
            eqTest: (a, b) => Object.is(a && a.datum, b && b.datum)
        }).on("dblclick", this.zoomToDatum.bind(this));

        this.genomeSpy.on("layout", layout => {
            this.resizeCanvases(layout);
            this.renderViewport();
            this.renderYAxis();
        });

        this.genomeSpy.on("zoom", () => {
            this.renderViewport();
        });

        this.genomeSpy.zoom.attachZoomEvents(this.glCanvas, point => {
            const datumAndMark = this.findDatumAndMarkAt(point);
            if (datumAndMark) {
                const datum = datumAndMark.datum,
                    mark = datumAndMark.mark;
                if (mark instanceof PointMark) {
                    // Snap the mouse cursor to the center of point marks to ease zooming
                    // TODO: Add a snap method to mark classes -> more abstract design
                    point[0] = this.genomeSpy.rescaledX(mark.encoders.x(datum));
                }
            }
            // TODO: Support RectMarks with minWidth

            return point;
        });

        this.initializeGraphics();
    }

    initializeGraphics() {
        this.view.visit(view => {
            if (view instanceof UnitView) {
                view.mark.initializeGraphics(this.gl);
            }
        });
    }

    resizeCanvases(layout) {
        this.adjustCanvas(this.glCanvas, layout.viewport);
        this.adjustGl();

        const trackHeight = this.trackContainer.clientHeight;
        this.adjustCanvas(this.leftCanvas, layout.axis, trackHeight);
    }

    /**
     *
     * @param {DatumAndMark} datumAndMark
     * @param {MouseEvent} mouseEvent
     * @param {*} point
     */
    zoomToDatum(datumAndMark, mouseEvent, point) {
        const e =
            /** @type {Object.<string, import("../encoder/encoder").NumberEncoder>} */ (datumAndMark
                .mark.encoders);
        const d = datumAndMark.datum;
        // TODO: handle case: x = 0
        if (e.x && e.x2) {
            const interval = new Interval(e.x(d), e.x2(d));
            this.genomeSpy.zoomTo(interval.pad(interval.width() * 0.25));
        } else if (e.x && !e.x2) {
            const width = 1000000; // TODO: Configurable

            this.genomeSpy.zoomTo(
                new Interval(e.x(d) - width / 2, e.x(d) + width / 2)
            );
        }
    }

    _getViewRoot() {
        let root = this.view;
        while (root.parent) {
            root = root.parent;
        }
        return root;
    }

    getXDomain() {
        return this._getViewRoot()
            .resolutions["x"].getScale()
            .domain();
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

        for (const mark of getMarks(this.view).reverse()) {
            if (mark.properties.tooltip !== null) {
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

        const props = mark.properties;
        const propertyFilter =
            props && props.tooltip && props.tooltip.skipFields
                ? entry => props.tooltip.skipFields.indexOf(entry[0]) < 0
                : entry => true;

        /**
         * @param {string} key
         * @param {object} datum
         */
        function legend(key, datum) {
            for (const [channel, encoder] of Object.entries(mark.encoders)) {
                if (encoder.accessor && encoder.accessor.fields.includes(key)) {
                    switch (channel) {
                        case "color":
                            return `<span class="color-legend" style="background-color: ${encoder(
                                datum
                            )}"></span>`;
                        default:
                    }
                }
            }

            return "";
        }

        const table =
            '<table class="attributes"' +
            Object.entries(datum)
                .filter(propertyFilter)
                .map(
                    ([key, value]) => `
                <tr>
                    <th>${html.escapeHtml(key)}</th>
                    <td>${html.escapeHtml(formatObject(value))} ${legend(
                        key,
                        datum
                    )}</td>
                </tr>`
                )
                .join("") +
            "</table>";

        const title = mark.unitView.spec.title
            ? `<div class="title"><strong>${html.escapeHtml(
                  mark.unitView.spec.title
              )}</strong></div>`
            : "";

        return `
        ${title}
        <div class="sample-track-datum-tooltip">
            ${table}
        </div>`;
    }

    renderViewport() {
        const gl = this.gl;

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
        ];

        for (const mark of getMarks(this.view)) {
            mark.render(samples, globalUniforms);
        }
    }

    getMinAxisWidth() {
        return this.getYAxisLayouts()
            .map(layout => layout.offsets.title)
            .reduce((a, b) => Math.max(a, b), 0);
    }

    renderYAxis() {
        const axisLength = this.trackContainer.clientHeight;
        const axisWidth = this.leftCanvas.clientWidth;
        const ctx = this.get2d(this.leftCanvas);

        for (const axisLayout of this.getYAxisLayouts()) {
            const scale = axisLayout.scale;
            const props = axisLayout.props;

            // --- Domain line ---

            if (props.domain) {
                const truncated = true;

                const domain = truncated ? axisLayout.ticks : scale.domain();

                ctx.fillStyle = props.domainColor;
                ctx.fillRect(
                    axisWidth - axisLayout.offsets.domain - props.domainWidth,
                    scale(domain[domain.length - 1]) - props.tickWidth / 2,
                    props.domainWidth,
                    Math.abs(
                        scale(domain[0]) - scale(domain[domain.length - 1])
                    ) +
                        props.tickWidth +
                        (scale.bandwidth ? scale.bandwidth() : 0)
                );
            }

            // --- Ticks ---

            const tickOffset =
                ((scale.bandwidth && scale.bandwidth()) || 0) / 2;

            if (props.ticks) {
                for (const tick of axisLayout.ticks) {
                    const y = scale(tick) + tickOffset;
                    ctx.fillStyle = props.tickColor;
                    ctx.fillRect(
                        axisWidth - axisLayout.offsets.ticks,
                        y - props.tickWidth / 2,
                        props.tickSize,
                        props.tickWidth
                    );
                }
            }

            // --- Labels ---

            if (props.labels) {
                ctx.font = `${props.labelFont} ${props.labelFontSize}px`;
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";

                for (let i = 0; i < axisLayout.ticks.length; i++) {
                    const tick = axisLayout.ticks[i];
                    const label = axisLayout.tickLabels[i];

                    const y = scale(tick) + tickOffset;
                    ctx.fillStyle = props.labelColor;
                    ctx.fillText(
                        label,
                        axisWidth - axisLayout.offsets.labels,
                        y
                    );
                }
            }

            // --- Title ---

            if (axisLayout.title) {
                ctx.save();

                ctx.translate(
                    axisWidth - axisLayout.offsets.title,
                    axisLength / 2
                );
                ctx.rotate(-Math.PI / 2);

                ctx.fillStyle = props.titleColor;

                ctx.font = `${props.titleFont} ${props.titleFontSize}px`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";

                ctx.fillText(axisLayout.title, 0, 0);

                ctx.restore();
            }
        }
    }

    /**
     * Computes layout and tick labels for the axes
     */
    getYAxisLayouts() {
        /** Padding between multiple axes: TODO: Configurable */
        const axisPadding = 10;

        const axisLength = this.trackContainer.clientHeight;

        const ctx = this.get2d(this.leftCanvas);

        const resolutions = getFlattenedViews(this.view)
            .map(view => view.getResolution("y"))
            .filter(resolution => resolution);

        let pos = 0;

        const axisLayouts = [];

        for (const resolution of resolutions) {
            const scale = resolution.getScale();

            const resolutionAxisProps = resolution.getAxisProps();
            if (resolutionAxisProps === null) {
                continue;
            }

            /** @type { import("../spec/axis").Axis} */
            const props = {
                ...defaultAxisProps,
                ...resolutionAxisProps
            };

            const axisLayout = {
                offsets: {
                    domain: 0,
                    ticks: 0,
                    labels: 0,
                    title: 0
                },
                /** @type {any[]} */
                ticks: [],
                /** @type {any[]} */
                tickLabels: [],
                /** @type {string} */
                title: undefined,
                scale: scale.copy().range([axisLength, 0]),
                props: props
            };
            axisLayouts.push(axisLayout);

            pos += props.offset;
            axisLayout.offsets.domain = pos;

            // Slightly decrease the tick density as the height increases
            let count =
                props.tickCount ||
                Math.round(
                    axisLength /
                        Math.exp(axisLength / 800) /
                        props.labelFontSize /
                        1.7
                );

            count = tickCount(scale, count, props.tickMinStep);

            /** @type {array} */
            axisLayout.ticks = props.values
                ? validTicks(scale, props.values, count)
                : tickValues(scale, count);

            // --- Ticks ---

            if (props.ticks) {
                pos += props.tickSize;
                axisLayout.offsets.ticks = pos;
            }

            // --- Labels ---

            if (props.labels) {
                pos += props.labelPadding;
                axisLayout.offsets.labels = pos;

                // TODO:
                // const maxAbs = d3max(scale.domain(), x => Math.abs(x));
                // scale.tickFormat(axisLayout.ticks.length, props.format || (maxAbs < 0.001 || maxAbs > 100000 ? "s" : undefined)) :

                const format = tickFormat(scale, count, props.format);

                axisLayout.tickLabels = axisLayout.ticks.map(format);

                pos += axisLayout.tickLabels
                    .map(label => ctx.measureText(label).width)
                    .reduce((a, b) => Math.max(a, b), 0);
            }

            // --- Title ---

            axisLayout.title = resolution.getTitle();

            if (axisLayout.title) {
                pos += props.titlePadding;
                pos += props.titleFontSize;
                axisLayout.offsets.title = pos;
            }

            pos += axisPadding;
        }

        return axisLayouts;
    }
}
