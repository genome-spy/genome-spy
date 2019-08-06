import * as twgl from 'twgl-base.js';
import { ticks as d3ticks } from 'd3-array'
import { scaleLinear } from 'd3-scale';
import { format as d3format } from 'd3-format';

import formatObject from '../utils/formatObject';
import Interval from '../utils/interval';
import ViewUnit from '../marks/viewUnit';
import WebGlTrack from './webGlTrack';
import DataSource from '../data/dataSource';
import MouseTracker from '../mouseTracker';
import * as html from '../utils/html';
import PointMark from '../marks/pointMark';


const defaultStyles = {
    height: null
}


export default class SimpleTrack extends WebGlTrack {
    /**
     * 
     * @param {import("./../genomeSpy").default } genomeSpy 
     * @param {object | import("../marks/viewUnit").ViewUnitConfig} config 
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
            resolver: this.findDatumAt.bind(this),
            tooltipConverter: datum => Promise.resolve(this.datumToTooltip(datum))
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
        return /** @type {Interval | void} */(this.viewUnit.getUnionDomain("x"));
    }

    /**
     * Returns all marks in the order they are rendered
     */
    getMarks() {
        /** @type {import("../marks/mark").default[]} */
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
        const datum = spec.rawDatum;

        /** @type {import("../marks/viewUnit").default} */
        const viewUnit = spec._viewUnit;

        const markConfig = viewUnit.mark.markConfig;
        const propertyFilter = markConfig.tooltip && markConfig.tooltip.skipFields ?
            entry => markConfig.tooltip.skipFields.indexOf(entry[0]) < 0 :
            entry => true;

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
                    <td>${html.escapeHtml(formatObject(value))} ${legend(key, datum)}</td>
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

    getMinAxisWidth() {
        return 40; // TODO: Compute from data
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
                    domain: /** @type {Interval} */(mark.getResolvedDomain("y"))
                }
            ]
        }
    }

    renderYAxis() {
        const conf = {
            tickSize: 5,
            tickWidth: 1,
            offset: 0,
            labelPadding: 5,
            labelFontSize: 10
        };

        const axisWidth = this.leftCanvas.clientWidth;
        const axisHeight = this.leftCanvas.clientHeight;

        const ctx = this.get2d(this.leftCanvas);
        const daa = this.getYDomainsAndAxes()[0]; // TODO: Support multiple domains

        const domain = daa.domain;
        const scale = scaleLinear()
            .domain(domain.toArray())
            .range([this.trackContainer.clientHeight, 0]);

        const format = domain.upper >= 1 && domain.upper <= 100 ?
            d3format(".2f") :
            d3format(".2s");

        // Slightly decrease the tick density as the height increases
        const tickCount = Math.round(axisHeight / Math.exp(axisHeight / 800) / conf.labelFontSize / 1.7);

        const ticks = d3ticks(domain.lower, domain.upper, tickCount);

        const tickX = axisWidth - conf.tickSize - conf.offset;
        const textX = tickX - conf.labelPadding;

        ctx.font = `sans-serif ${conf.labelFontSize}px`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        ctx.fillRect(
            tickX + conf.tickSize - conf.tickWidth,
            scale(ticks[ticks.length - 1]) - conf.tickWidth / 2,
            conf.tickWidth,
            Math.abs(scale(ticks[0]) - scale(ticks[ticks.length - 1])) + conf.tickWidth);

        for (const tick of ticks) {
            const y = scale(tick);
            ctx.fillRect(tickX, y - conf.tickWidth / 2, conf.tickSize, conf.tickWidth);
            ctx.fillText(format(tick), textX, y);
        }
    }
}