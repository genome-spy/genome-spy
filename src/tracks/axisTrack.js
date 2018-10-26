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
    }

    resizeCanvases(layout) {
        const trackHeight = this.trackContainer.clientHeight;

        this.tickCanvas.style.left = `${layout.viewport[0]}px`;
        this.tickCanvas.width = layout.viewport[1];
        this.tickCanvas.height = trackHeight;
    }

    renderTicks() {
        const chromLabelMarginLeft = 5;
        const chromLabelMarginRight = 3;
        const chromLabelMargin = chromLabelMarginLeft + chromLabelMarginRight;

        const scale = this.genomeSpy.getZoomedScale();
        const cm = this.genomeSpy.chromMapper;

        const ctx = this.tickCanvas.getContext("2d");
        ctx.clearRect(0, 0, this.tickCanvas.width, this.tickCanvas.height);
        ctx.fillStyle = "black";
        ctx.textBaseline = "middle";

        const y = Math.round(this.tickCanvas.height / 2);

        // TODO: Consider moving to Track base class
        const viewportInterval = Interval.fromArray(scale.range());
        const domainInterval = Interval.fromArray(scale.domain());

        this.chromosomes.forEach((chrom, i) => {
            const chromInterval = chrom.continuousInterval.transform(scale); // TODO: Consider rounding. Would be crisper but less exact
            
            if (viewportInterval.contains(chromInterval.lower)) {
                ctx.fillRect(chromInterval.lower, 0, 1, this.tickCanvas.height / 3);

                if (chromInterval.width() > this._chromLabelWidths[i] + chromLabelMargin) {
                    // TODO: Some cool clipping and masking instead of just hiding
                    ctx.fillText(chrom.name, chromInterval.lower + chromLabelMarginLeft, y);
                }
            }
        });

        // Handle the leftmost chromosome
        if (domainInterval.lower > 0) {
            const chrom = cm.toChromosomal(domainInterval.lower).chromosome;
            const chromInterval = chrom.continuousInterval.transform(scale);
            const labelWidth = this._chromLabelWidths[chrom.index];

            const x = Math.min(chromInterval.upper - labelWidth  - chromLabelMarginRight, chromLabelMarginLeft);

            ctx.fillText(chrom.name, x, y);
        }

    }
}
