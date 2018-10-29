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

        this.trackContainer.style = "height: 14px; overflow: hidden; position: relative"; // TODO: Make this more abstract

        this.tickCanvas = this.createCanvas();

        genomeSpy.on("zoom", this.renderTicks.bind(this));

        genomeSpy.on("layout", function(layout) {
            this.resizeCanvases(layout);
            this.renderTicks();
        }.bind(this));

        const cm = genomeSpy.chromMapper;
        this.chromosomes = cm.chromosomes();

        const ctx = this.tickCanvas.getContext("2d");
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
        const y = Math.round(this.tickCanvas.height / 2);

        // TODO: Consider moving to Track base class
        const viewportInterval = Interval.fromArray(scale.range());
        const domainInterval = Interval.fromArray(scale.domain());

        const tickStep = d3.tickStep(domainInterval.lower, domainInterval.upper, this._maxTickCount);

        const locusTickFormat = tickStep >= 1000000 ? d3.format(".3s") : d3.format(",");

        function renderLocusTicks(interval, visibleInterval = null) {
            if (interval.width() < 3 * tickStep) return;

            if (visibleInterval == null) {
                visibleInterval = interval;
            }

            if (visibleInterval.lower == interval.lower) {
                visibleInterval = visibleInterval.withLower(visibleInterval.lower + 1);
            }

            ctx.textAlign = "center";
            ctx.fillStyle = "#b0b0b0"; // TODO: Configurable

            // In screen coordinates
            const screenInterval = interval.transform(scale);

            for (
                let locus = Math.ceil((visibleInterval.lower - interval.lower) / tickStep) * tickStep;
                locus + interval.lower < visibleInterval.upper;
                locus += tickStep
            ) {
                const x = scale(locus + interval.lower);
                const text = locusTickFormat(locus);

                if (x + ctx.measureText(text).width / 2 > screenInterval.upper) break; 

                ctx.fillRect(x, 0, 1, 2);
                ctx.fillText(text, x, y);
            }
        }

        ctx.clearRect(0, 0, this.tickCanvas.width, this.tickCanvas.height);
        ctx.textBaseline = "middle";

        this.chromosomes.forEach((chrom, i) => {
            const screenInterval = chrom.continuousInterval.transform(scale); // TODO: Consider rounding. Would be crisper but less exact
            
            if (viewportInterval.contains(screenInterval.lower)) {
                ctx.fillStyle = "black";
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

            ctx.fillStyle = "black";
            ctx.textAlign = "left";
            ctx.fillText(chrom.name, x, y);

            const a = scale.invert(x + labelWidth + chromLabelMarginTotal);
            const b = Math.min(chrom.continuousInterval.upper, domainInterval.upper);
               
            if (a < b) {
                renderLocusTicks(chrom.continuousInterval, new Interval(a, b));
            }
        }

    }
}
