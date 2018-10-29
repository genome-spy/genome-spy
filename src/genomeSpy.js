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

        this.eventEmitter.emit('layout', layout);
    }

    // TODO: Come up with a sensible name. And maybe this should be called at the end of the constructor.
    launch() {
        const spy = this;

        window.addEventListener('resize', this._resized.bind(this), false);

        const genomeExtent = this.chromMapper.extent();

        d3.select(spy.container).call(this.zoom
            /* // Borken!
            .extent([
                [this.getAxisWidth(), 0],
                [this.container.offsetWidth, this.container.offsetHeight]])
                */
            .scaleExtent([1, genomeExtent[1] / spy.container.offsetWidth / 10])
            .translateExtent([[genomeExtent[0], -Infinity], [genomeExtent[1], Infinity]]) // Check this: https://bl.ocks.org/mbostock/4015254
            .on("zoom", this._zoomed.bind(this)));

        this.container.styleClass = "genome-spy";
        this.container.style.display = "flex"; // TODO: CSS
        this.container.style.flexDirection = "column";

        spy.tracks.forEach(track => {
            const trackContainer = document.createElement("div");
            trackContainer.className = "genome-spy-track";
            this.container.appendChild(trackContainer);

            track.initialize({genomeSpy: this, trackContainer});
        });

        this._resized();
    }
}