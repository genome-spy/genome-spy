import Track from "./track";
import { getFlattenedViews } from "../view/viewUtils";
import Interval from "../utils/interval";
import { createAxisLayout } from "../utils/axis";
import { scale as vegaScale } from "vega-scale";

/**
 * A track that displays ticks
 */
export default class AxisTrack extends Track {
    /**
     * @param {import("../genomeSpy").default} genomeSpy
     */
    constructor(genomeSpy, config) {
        super(genomeSpy, config);
    }

    /**
     * @param {HTMLElement} trackContainer
     */
    async initialize(trackContainer) {
        await super.initialize(trackContainer);

        this.height = Math.ceil(40);

        this.trackContainer.className = "axis-track";
        this.trackContainer.style.height = `${this.height}px`;

        this.tickCanvas = this.createCanvas();

        this.genomeSpy.on("zoom", this.renderTicks.bind(this));

        this.genomeSpy.on(
            "layout",
            function(layout) {
                this.resizeCanvases(layout);
                this.renderTicks();
            }.bind(this)
        );

        this.genomeSpy.zoom.attachZoomEvents(this.tickCanvas);
    }

    resizeCanvases(layout) {
        this.adjustCanvas(this.tickCanvas, layout.viewport);
        this._layout = layout;
    }

    renderTicks() {
        const ctx = this.get2d(this.tickCanvas);

        // TODO: Consider moving to Track base class
        //const viewportInterval = Interval.fromArray(scale.range());
        //const domainInterval = Interval.fromArray(scale.domain());

        const measureWidth = /** @param {string} label*/ label =>
            ctx.measureText(label).width;

        const axisLength = this.tickCanvas.clientWidth;
        const axisWidth = this.tickCanvas.clientHeight;

        const scale = vegaScale("linear")()
            .domain(this.genomeSpy.getZoomedScale().domain())
            .range([0, axisLength]);

        const axisLayout = getFlattenedViews(this.genomeSpy.viewRoot)
            .map(view => view.resolutions["x"])
            .filter(resolution => resolution)
            .map(r =>
                createAxisLayout(
                    r,
                    axisLength,
                    measureWidth,
                    "horizontal",
                    scale
                )
            )
            .find(l => !!l);

        ctx.clearRect(
            0,
            0,
            this.tickCanvas.clientWidth,
            this.tickCanvas.clientHeight
        );

        const props = axisLayout.props;

        // --- Domain line ---

        if (props.domain) {
            const truncated = false;

            const domain = truncated ? axisLayout.ticks : scale.domain();

            ctx.fillStyle = props.domainColor;
            ctx.fillRect(
                scale(domain[0]) - props.tickWidth / 2,
                axisLayout.offsets.domain,
                Math.abs(scale(domain[0]) - scale(domain[domain.length - 1])) +
                    props.tickWidth +
                    (scale.bandwidth ? scale.bandwidth() : 0),
                props.domainWidth
            );
        }

        // --- Ticks ---

        const tickOffset = ((scale.bandwidth && scale.bandwidth()) || 0) / 2;

        if (props.ticks) {
            for (const tick of axisLayout.ticks) {
                const x = scale(tick) + tickOffset;
                ctx.fillStyle = props.tickColor;
                ctx.fillRect(
                    x - props.tickWidth / 2,
                    axisLayout.offsets.ticks - props.tickSize,
                    props.tickWidth,
                    props.tickSize
                );
            }
        }

        // --- Labels ---

        if (props.labels) {
            ctx.font = `${props.labelFont} ${props.labelFontSize}px`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            for (let i = 0; i < axisLayout.ticks.length; i++) {
                const tick = axisLayout.ticks[i];
                const label = axisLayout.tickLabels[i];

                const x = scale(tick) + tickOffset;
                ctx.fillStyle = props.labelColor;
                ctx.fillText(label, x, axisLayout.offsets.labels);
            }
        }

        // --- Title ---

        if (axisLayout.title) {
            ctx.fillStyle = props.titleColor;

            ctx.font = `${props.titleFont} ${props.titleFontSize}px`;
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";

            ctx.fillText(
                axisLayout.title,
                axisLength / 2,
                axisLayout.offsets.title
            );
        }
    }
}
