import { tickStep } from "d3-array";
import { format as d3format } from "d3-format";
import { rgb, color } from "d3-color";

import Track from "./track";
import Interval from "../utils/interval";
import clientPoint from "../utils/point";
import Genome from "../genome/genome";

const defaultStyles = {
    fontSize: 12,
    fontFamily: "sans-serif",

    chromColor: "black",
    locusColor: "#a8a8a8"
};

/**
 * A track that displays ticks
 */
export default class GenomeAxisTrack extends Track {
    constructor(genomeSpy, config) {
        super(genomeSpy, config);

        this.styles = defaultStyles;

        this.genome = genomeSpy.coordinateSystem;
        if (!(this.genome instanceof Genome)) {
            throw new Error("The coordinate system is not genomic!");
        }
    }

    /**
     * @param {HTMLElement} trackContainer
     */
    async initialize(trackContainer) {
        await super.initialize(trackContainer);

        this.height = Math.ceil(this.styles.fontSize * 1.5);

        this.trackContainer.className = "genome-axis-track";
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

        const cm = this.genome.chromMapper;
        this.chromosomes = cm.chromosomes();

        const ctx = this.get2d(this.tickCanvas);
        ctx.font = `${this.styles.fontSize}px ${this.styles.fontFamily}`;

        this._chromLabelWidths = this.chromosomes.map(
            chrom => ctx.measureText(chrom.name).width
        );

        this.tickCanvas.addEventListener("dblclick", event =>
            this.genomeSpy.zoomTo(
                cm.toChromosomal(
                    this.genomeSpy
                        .getZoomedScale()
                        .invert(clientPoint(this.tickCanvas, event)[0])
                ).chromosome.continuousInterval
            )
        );
    }

    resizeCanvases(layout) {
        this.adjustCanvas(this.tickCanvas, layout.viewport);
        this._layout = layout;
    }

    renderTicks() {
        const chromLabelMarginLeft = 5;
        const chromLabelMarginRight = 3;
        const chromLabelMarginTotal =
            chromLabelMarginLeft + chromLabelMarginRight;

        const scale = this.genomeSpy.getZoomedScale();
        const cm = this.genome.chromMapper;

        const ctx = this.get2d(this.tickCanvas);

        // TODO: Consider moving to Track base class
        const viewportInterval = Interval.fromArray(scale.range());
        const domainInterval = Interval.fromArray(scale.domain());

        const locusTickFormat =
            domainInterval.width() > 5e7 ? d3format(".3s") : d3format(",");

        const maxRawLocusLabelWidth = ctx.measureText(locusTickFormat(1.23e8))
            .width;

        const y = Math.round(this.tickCanvas.clientHeight * 1);
        ctx.textBaseline = "bottom";
        ctx.font = `${this.styles.fontSize}px ${this.styles.fontFamily}`;

        const renderLocusTicks = (
            interval,
            chromLabelWidth,
            visibleInterval = null,
            gradientOffset = 0
        ) => {
            const maxLocusLabelWidth =
                maxRawLocusLabelWidth + chromLabelWidth / 2;
            const maxTickCount = Math.min(
                20,
                Math.floor(
                    this._layout.viewport.width() / maxLocusLabelWidth / 2.0
                )
            );
            const step = tickStep(
                domainInterval.lower,
                domainInterval.upper,
                maxTickCount
            );

            // Need to accommodate least n ticks before any are shown
            if (interval.width() < 2.5 * step) return;

            if (visibleInterval == null) {
                visibleInterval = interval;
            }

            if (visibleInterval.lower == interval.lower) {
                // Add one to skip the zeroth tick
                visibleInterval = visibleInterval.withLower(
                    visibleInterval.lower + 1
                );
            }

            visibleInterval = visibleInterval
                .intersect(
                    // Upper bound to the right edge of the viewport
                    new Interval(
                        -Infinity,
                        scale.invert(
                            this.tickCanvas.clientWidth + maxLocusLabelWidth
                        )
                    )
                )
                .intersect(
                    // Uppert bound so that the last tick does not overlap with the next chromosome label
                    // TODO: A pretty gradient
                    new Interval(
                        -Infinity,
                        interval.upper -
                            scale.invert(maxLocusLabelWidth / 2) +
                            scale.invert(0)
                    )
                );

            // An empty interval? Skip.
            if (visibleInterval == null) return;

            if (gradientOffset > 0) {
                const withOpacity = opacity => {
                    const newColor = rgb(color(this.styles.locusColor));
                    newColor.opacity = opacity;
                    return newColor;
                };

                // TODO: Performance optimization: Only use gradient for the leftmost locus tick
                const locusTickGradient = ctx.createLinearGradient(
                    gradientOffset,
                    0,
                    gradientOffset + 30,
                    0
                );
                locusTickGradient.addColorStop(0, withOpacity(0));
                locusTickGradient.addColorStop(0.5, withOpacity(0.3));
                locusTickGradient.addColorStop(1, withOpacity(1));
                ctx.fillStyle = locusTickGradient;
            } else {
                ctx.fillStyle = this.styles.locusColor;
            }

            ctx.textAlign = "center";

            // Put the tick in the middle of the locus/base
            const offset = 0.5;

            // GenomeSpy uses the same coordinate logic as USCS GenomeBrowser_
            // "1-start, fully-closed" = coordinates positioned within the web-based UCSC Genome Browser.
            // "0-start, half-open" = coordinates stored in database tables.
            const labelValueOffset = 1;

            for (
                let locus =
                    Math.ceil((visibleInterval.lower - interval.lower) / step) *
                        step +
                    offset -
                    labelValueOffset;
                locus + interval.lower < visibleInterval.upper;
                locus += step
            ) {
                const x = scale(locus + interval.lower) - 0.5;

                const text = locusTickFormat(locus - offset + labelValueOffset);
                ctx.fillRect(x, 0, 1, 3);
                ctx.fillText(text, x, y);
            }
        };

        ctx.clearRect(
            0,
            0,
            this.tickCanvas.clientWidth,
            this.tickCanvas.clientHeight
        );

        this.chromosomes.forEach((chrom, i) => {
            const screenInterval = chrom.continuousInterval.transform(scale);

            if (viewportInterval.contains(screenInterval.lower)) {
                ctx.fillStyle = this.styles.chromColor;
                ctx.fillRect(
                    screenInterval.lower - 0.5,
                    0,
                    1,
                    this.tickCanvas.clientHeight / 1
                );

                if (
                    screenInterval.width() >
                    this._chromLabelWidths[i] + chromLabelMarginTotal
                ) {
                    // TODO: Some cool clipping and masking instead of just hiding
                    ctx.textAlign = "left";
                    ctx.fillText(
                        chrom.name,
                        screenInterval.lower - 0.5 + chromLabelMarginLeft,
                        y
                    );
                }

                renderLocusTicks(
                    chrom.continuousInterval,
                    this._chromLabelWidths[i]
                );
            }
        });

        // Handle the leftmost chromosome
        if (domainInterval.lower > 0) {
            const chrom = cm.toChromosomal(domainInterval.lower).chromosome;
            const chromInterval = chrom.continuousInterval.transform(scale);
            const labelWidth = this._chromLabelWidths[chrom.index];

            const x = Math.min(
                chromInterval.upper - labelWidth - chromLabelMarginRight,
                chromLabelMarginLeft
            );

            ctx.fillStyle = this.styles.chromColor;
            ctx.textAlign = "left";
            ctx.fillText(chrom.name, x, y);

            const a = scale.invert(x);
            const b = chrom.continuousInterval.upper;

            if (a < b) {
                renderLocusTicks(
                    chrom.continuousInterval,
                    labelWidth,
                    new Interval(a, b),
                    labelWidth + chromLabelMarginLeft
                );
            }
        }
    }
}
