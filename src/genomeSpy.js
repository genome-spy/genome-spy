import EventEmitter from "eventemitter3";
import * as d3 from 'd3';
import { chromMapper } from "./chromMapper";
import Interval from "./utils/interval";


/**
 * The actual browser without any toolbars etc
 */
export default class GenomeSpy {
    constructor(container, genome, tracks) {
        this.genome = genome;
        this.container = container;
        this.tracks = tracks;

        this.chromMapper = chromMapper(genome.chromSizes);

        this.xScale = d3.scaleLinear()
            .domain(this.chromMapper.extent());
        
        // Zoomed scale
        this.rescaledX = this.xScale;

        this.eventEmitter = new EventEmitter();

        this.zoom = d3.zoom();
    }

    on(...args) {
        // TODO: A mixin or multiple inheritance would be nice
        this.eventEmitter.on(...args);
    }

    _zoomed() {
        this.rescaledX = d3.event.transform.rescaleX(this.xScale);
        this.eventEmitter.emit('zoom', this.rescaledX);
    }
    
    getVisibleDomain() {
        return this.rescaledX.domain();
    }

    getZoomedScale() {
        return this.rescaledX.copy();
    }

    getAxisWidth() {
        return this.tracks
            .map(track => track.getMinAxisWidth())
            .reduce((a, b) => Math.max(a, b), 0);
    }

    _resized() {
        const aw = this.getAxisWidth();
        const viewportWidth = this.container.clientWidth - aw;

        this.xScale.range([0, viewportWidth]);
        this.rescaledX.range([0, viewportWidth]);

        // The layout only deals with horizontal coordinates. The tracks take care of their height.
        // TODO: Implement LayoutBuilder
        const layout = {
            axis: new Interval(0, aw),
            viewport: new Interval(aw, aw + viewportWidth)
        };

        this.viewportOverlay.style.left = `${aw}px`;
        this.viewportOverlay.style.width = `${viewportWidth}px`;

        this.eventEmitter.emit('layout', layout);
    }

    // TODO: Come up with a sensible name. And maybe this should be called at the end of the constructor.
    launch() {
        window.addEventListener('resize', this._resized.bind(this), false);

        this.container.classname = "genome-spy";

        const trackStack = document.createElement("div");
        trackStack.className = "track-stack";
        // TODO: Put these to CSS
        trackStack.style.position = "absolute";
        trackStack.style.top = 0;
        trackStack.style.bottom = 0;
        trackStack.style.left = 0;
        trackStack.style.right = 0;
        trackStack.style.display = "flex";
        trackStack.style.flexDirection = "column";

        this.tracks.forEach(track => {
            const trackContainer = document.createElement("div");
            trackContainer.className = "genome-spy-track";
            trackStack.appendChild(trackContainer);

            track.initialize({genomeSpy: this, trackContainer});
        });

        this.container.appendChild(trackStack);

        const viewportOverlay = document.createElement("div");
        viewportOverlay.className = "viewport-overlay";
        // TODO: Put these to CSS
        viewportOverlay.style.position = "absolute";
        viewportOverlay.style.top = 0;
        viewportOverlay.style.bottom = 0;

        this.container.appendChild(viewportOverlay);

        const genomeExtent = this.chromMapper.extent();

        d3.select(viewportOverlay).call(this.zoom
            /* // Borken!
            .extent([
                [this.getAxisWidth(), 0],
                [this.container.offsetWidth, this.container.offsetHeight]])
                */
            .scaleExtent([1, genomeExtent[1] / this.container.offsetWidth / 10])
            .translateExtent([[genomeExtent[0], -Infinity], [genomeExtent[1], Infinity]]) // Check this: https://bl.ocks.org/mbostock/4015254
            .on("zoom", this._zoomed.bind(this)));

        this.trackStack = trackStack;
        this.viewportOverlay = viewportOverlay;

        this._resized();
    }
}