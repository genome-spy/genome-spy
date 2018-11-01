import * as d3 from "d3";
import Track from './track';
import Interval from '../utils/interval';

/**
 * A track that displays ticks
 */
export default class AxisTrack extends Track {
    constructor() {
        super();
    }

    initialize({genomeSpy, trackContainer}) {
        super.initialize({genomeSpy, trackContainer});

        this.trackContainer.className = "axis-track";
        this.trackContainer.style.height = "17px";

        this.tickCanvas = this.createCanvas();

        genomeSpy.on("zoom", this.renderTicks.bind(this));

        genomeSpy.on("layout", function(layout) {
            this.resizeCanvases(layout);
            this.renderTicks();
        }.bind(this));

        const cm = genomeSpy.chromMapper;
        this.chromosomes = cm.chromosomes();

        // TODO: Configurable
        this.chromColor = d3.color("black");
        this.locusColor = d3.color("#a8a8a8");
        this.fontSize = 12;
        this.font = "sans-serif";

        const ctx = this.tickCanvas.getContext("2d");
        ctx.font = `${this.fontSize}px ${this.font}`;

        this._chromLabelWidths = this.chromosomes.map(chrom => ctx.measureText(chrom.name).width);
        this._maxLocusLabelWidth = ctx.measureText("123,000,000").width;

    }

    resizeCanvases(layout) {
        const trackHeight = this.trackContainer.clientHeight;

        this.tickCanvas.style.left = `${layout.viewport.lower}px`;
        this.tickCanvas.width = layout.viewport.width();
        this.tickCanvas.height = trackHeight;

        this._maxTickCount = Math.floor(layout.viewport.width() / this._maxLocusLabelWidth / 2.0);
    }

    renderTicks() {
        const chromLabelMarginLeft = 5;
        const chromLabelMarginRight = 3;
        const chromLabelMarginTotal = chromLabelMarginLeft + chromLabelMarginRight;

        const scale = this.genomeSpy.getZoomedScale();
        const cm = this.genomeSpy.chromMapper;

        const ctx = this.tickCanvas.getContext("2d");

        // TODO: Consider moving to Track base class
        const viewportInterval = Interval.fromArray(scale.range());
        const domainInterval = Interval.fromArray(scale.domain());

        const tickStep = d3.tickStep(domainInterval.lower, domainInterval.upper, this._maxTickCount);

        const locusTickFormat = tickStep >= 1000000 ? d3.format(".3s") : d3.format(",");

        const y = Math.round(this.tickCanvas.height * 1);
        ctx.textBaseline = "bottom";
        ctx.font = `${this.fontSize}px ${this.font}`;

        const renderLocusTicks = (interval, visibleInterval = null, gradientOffset = 0) => {
            // Need to accommodate least n ticks before any are shown
            if (interval.width() < 3 * tickStep) return;

            if (visibleInterval == null) {
                visibleInterval = interval;
            }

            if (visibleInterval.lower == interval.lower) {
                // Add one to skip zeroth tick
                visibleInterval = visibleInterval.withLower(visibleInterval.lower + 1);
            }

            visibleInterval = visibleInterval.intersect(
                // Upper bound to the right edge of the viewport
                new Interval(-Infinity, scale.invert(this.tickCanvas.width + this._maxLocusLabelWidth))
            ).intersect(
                // Uppert bound so that the last tick does not overlap with the next chromosome label
                // TODO: A pretty gradient
                new Interval(-Infinity, interval.upper - scale.invert(this._maxLocusLabelWidth / 2) + scale.invert(0))
            );
            
            // An empty interval? Skip.
            if (visibleInterval == null) return;

            if (gradientOffset > 0) {
                const withOpacity = (color, opacity) => {
                    const newColor = d3.rgb(color);
                    newColor.opacity = opacity;
                    return newColor;
                };

                // TODO: Performance optimization: Only use gradient for the leftmost locus tick
                const locusTickGradient = ctx.createLinearGradient(gradientOffset, 0, gradientOffset + 30, 0);
                locusTickGradient.addColorStop(0,   withOpacity(this.locusColor, 0));
                locusTickGradient.addColorStop(0.5, withOpacity(this.locusColor, 0.3));
                locusTickGradient.addColorStop(1,   withOpacity(this.locusColor, 1));
                ctx.fillStyle = locusTickGradient; 

            } else {
                ctx.fillStyle = this.locusColor;
            }

            ctx.textAlign = "center";

            for (
                let locus = Math.ceil((visibleInterval.lower - interval.lower) / tickStep) * tickStep;
                locus + interval.lower < visibleInterval.upper;
                locus += tickStep
            ) {
                const x = scale(locus + interval.lower);

                const text = locusTickFormat(locus);
                ctx.fillRect(x, 0, 1, 3);
                ctx.fillText(text, x, y);
            }
        };

        ctx.clearRect(0, 0, this.tickCanvas.width, this.tickCanvas.height);

        this.chromosomes.forEach((chrom, i) => {
            const screenInterval = chrom.continuousInterval.transform(scale); // TODO: Consider rounding. Would be crisper but less exact
            
            if (viewportInterval.contains(screenInterval.lower)) {
                ctx.fillStyle = this.chromColor;
                ctx.fillRect(screenInterval.lower, 0, 1, this.tickCanvas.height / 1);

                if (screenInterval.width() > this._chromLabelWidths[i] + chromLabelMarginTotal) {
                    // TODO: Some cool clipping and masking instead of just hiding
                    ctx.textAlign = "left";
                    ctx.fillText(chrom.name, screenInterval.lower + chromLabelMarginLeft, y);
                }

                renderLocusTicks(chrom.continuousInterval);
            }
        });

        // Handle the leftmost chromosome
        if (domainInterval.lower > 0) {
            const chrom = cm.toChromosomal(domainInterval.lower).chromosome;
            const chromInterval = chrom.continuousInterval.transform(scale);
            const labelWidth = this._chromLabelWidths[chrom.index];

            const x = Math.min(chromInterval.upper - labelWidth  - chromLabelMarginRight, chromLabelMarginLeft);

            ctx.fillStyle = this.chromColor;
            ctx.textAlign = "left";
            ctx.fillText(chrom.name, x, y);

            const a = scale.invert(x);
            const b = chrom.continuousInterval.upper;
               
            if (a < b) {
                renderLocusTicks(chrom.continuousInterval, new Interval(a, b), labelWidth + chromLabelMarginLeft);
            }
        }

    }
}
