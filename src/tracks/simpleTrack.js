import * as twgl from 'twgl-base.js';
import { inferType } from 'vega-loader';
import { format as d3format } from 'd3-format';

import Interval from '../utils/interval';
import ViewUnit from '../layers/viewUnit';
import WebGlTrack from './webGlTrack';
import DataSource from '../data/dataSource';
import MouseTracker from '../mouseTracker';
import * as html from '../utils/html';
import PointMark from '../layers/pointMark';


const defaultStyles = {
    height: null
}


export default class SimpleTrack extends WebGlTrack {
    /**
     * 
     * @param {import("./../genomeSpy").default } genomeSpy 
     * @param {object | import("../layers/viewUnit").ViewUnitConfig} config 
     */
    constructor(genomeSpy, config) {
        super(genomeSpy, config);

        this.styles = Object.assign({}, defaultStyles, config.styles);

        this.viewUnit = new ViewUnit(
            {
                genomeSpy,
                track: this,
                getDataSource: config => new DataSource(config, genomeSpy.config.baseurl)
            },
           undefined,
           config
        );
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
            resolver: this.findDatumAt.bind(this),
            tooltipConverter: datum => Promise.resolve(this.datumToTooltip(datum))
        })
            .on("dblclick", this.zoomToSpec.bind(this));


        this.genomeSpy.on("layout", layout => {
            this.resizeCanvases(layout);
            this.renderViewport();
        });

        this.genomeSpy.on("zoom", () => {
            this.renderViewport();
        });

        this.genomeSpy.zoom.attachZoomEvents(
            this.glCanvas,
            point => {
                const datum = this.findDatumAt(point);
                if (datum && datum._mark instanceof PointMark) {
                    // Snap the mouse cursor to the center of point marks to ease zooming
                    // TODO: Add a snap method to mark classes -> more abstract design
                    point[0] = this.genomeSpy.rescaledX(datum.x);
                }
                // TODO: Support RectMarks with minWidth

                return point;
            });

        await this.viewUnit.initialize();
    }

    resizeCanvases(layout) {
        this.adjustCanvas(this.glCanvas, layout.viewport);
        this.adjustGl(this.gl);
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
        /** @type {import("../utils/interval").default} */
        let interval;
        for (const mark of this.getMarks()) {
            if (interval) {
                const markInterval = mark.getXDomain();
                if (markInterval) {
                    interval = interval.span(markInterval);
                }
            } else {
                interval = mark.getXDomain();
            }
        }
        return interval;
    }

    /**
     * Returns all marks in the order they are rendered
     */
    getMarks() {
        /** @type {import("../layers/mark").default[]} */
        const layers = [];
        this.viewUnit.visit(vu => {
            if (vu.mark) {
                layers.push(vu.mark);
            }
        });
        return layers;
    }

    getYDomainsAndAxes() {
        // TODO:
        // 1. Collect all y scales and axis confs
        // 2. Union shared scales and axes
        // 3. Return a list...
        
        const marks = this.getMarks();
        if (marks.length > 0) {
            const mark = marks[0];

            return [
                {
                    title: "Blaa",
                    axisConf: null,
                    domain: mark._getYDomain()
                }
            ]
        }
    }

    /**
     * Returns the datum (actually the mark spec) at the specified point
     * 
     * @param {number[]} point 
     */
    findDatumAt(point) {
        const [x, y] = point;

        const bandInterval = new Interval(0, this.glCanvas.clientHeight);

        for (const mark of this.getMarks().reverse()) {
            if (mark.markConfig.tooltip !== null) {
                const spec = mark.findDatum(undefined, x, y, bandInterval);
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

        /** @type {import("../layers/viewUnit").default} */
        const viewUnit = spec._viewUnit;

        const markConfig = viewUnit.mark.markConfig;
        const propertyFilter = markConfig.tooltip && markConfig.tooltip.skipFields ?
            entry => markConfig.tooltip.skipFields.indexOf(entry[0]) < 0 :
            entry => true;

        function toString(object) {
            if (object === null) {
                return "";
            }

            const type = inferType([object]);

            if (type == "string") {
                return object.substring(0, 30);

            } else if (type == "integer") {
                return "" + object;

            } else if (type == "number") {
                return numberFormat(object);

            } else if (type == "boolean") {
                return object ? "True" : "False";

            } else {
                return "?" + type + " " + object;
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

        this.viewUnit.visit(vu => {
            if (vu.mark) {
                vu.mark.render(samples, globalUniforms)
            }
        });
    }
}