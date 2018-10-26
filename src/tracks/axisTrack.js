import Track from './track';

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
    }

    resizeCanvases(layout) {
        const trackHeight = this.trackContainer.clientHeight;

        this.tickCanvas.style.left = `${layout.viewport[0]}px`;
        this.tickCanvas.width = layout.viewport[1];
        this.tickCanvas.height = trackHeight;
    }

    renderTicks() {
        const cm = this.genomeSpy.chromMapper;
        const scale = this.genomeSpy.getZoomedScale();

        const ctx = this.tickCanvas.getContext("2d");
        ctx.clearRect(0, 0, this.tickCanvas.width, this.tickCanvas.height);
        ctx.fillStyle = "black";
        ctx.textBaseline = "middle";

        const y = Math.round(this.tickCanvas.height / 2);

        cm.linearChromPositions().forEach((coord, i) => {
            const x = scale(coord); // TODO: Consider rounding. Would be crisper but less exact

            ctx.fillRect(x, 0, 1, this.tickCanvas.height / 3);

            ctx.fillText(cm.chromName(i), x + 5, y);
        });

    }
}
