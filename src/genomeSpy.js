import EventEmitter from "eventemitter3";
import * as d3 from 'd3';
import { chromMapper } from "./chromMapper";
import Interval from "./utils/interval";
import "./styles/genome-spy.scss";

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
            .domain(this.chromMapper.extent().toArray());
        
        // Zoomed scale
        this.rescaledX = this.xScale;

        this.eventEmitter = new EventEmitter();

        this.zoom = d3.zoom();

        // TODO: A configuration object
        /** When zooming, the maximum size of a single discrete unit (nucleotide) in pixels */
        this.maxUnitZoom = 20;
    }

    on(...args) {
        // TODO: A mixin or multiple inheritance would be nice
        this.eventEmitter.on(...args);
    }

    _zoomed() {
        this.rescaledX = d3.event.transform.rescaleX(this.xScale);
        this.eventEmitter.emit('zoom', this.getVisibleInterval());
    }
    
    getVisibleDomain() {
        return this.rescaledX.domain();
    }

    getVisibleInterval() {
        return Interval.fromArray(this.rescaledX.domain());
    }

    getZoomedScale() {
        return this.rescaledX.copy();
    }

    getAxisWidth() {
        return this.tracks
            .map(track => track.getMinAxisWidth())
            .reduce((a, b) => Math.max(a, b), 0);
    }

    zoomTo(interval) {
        const x = this.xScale;
		const transform = d3.zoomIdentity
			.scale(this.viewportOverlay.clientWidth / (x(interval.upper) - x(interval.lower)))
			.translate(-x(interval.lower), 0);

		d3.select(this.viewportOverlay).transition()
			.duration(750)
			// Assume that the transition was triggered by search when the duration is defined
			//.on("end", onEnd ? onEnd : () => true)
			.call(this.zoom.transform, transform);

    }
    _resized() {
        const aw = Math.ceil(this.getAxisWidth());
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

        this.zoom.translateExtent([[0, -Infinity], [viewportWidth, Infinity]]);

        this.eventEmitter.emit('layout', layout);
    }

    // TODO: Come up with a sensible name. And maybe this should be called at the end of the constructor.
    launch() {
        window.addEventListener('resize', this._resized.bind(this), false);

        this.container.classList.add("genome-spy");

        const trackStack = document.createElement("div");
        trackStack.className = "track-stack";

        this.tracks.forEach(track => {
            const trackContainer = document.createElement("div");
            trackContainer.className = "genome-spy-track";
            trackStack.appendChild(trackContainer);

            track.initialize({genomeSpy: this, trackContainer});
        });

        this.container.appendChild(trackStack);

        const viewportOverlay = document.createElement("div");
        viewportOverlay.className = "viewport-overlay";

        this.container.appendChild(viewportOverlay);

        const genomeExtent = this.chromMapper.extent();

        d3.select(viewportOverlay)
            .call(this.zoom
                .scaleExtent([1, genomeExtent.width() / this.container.clientWidth * this.maxUnitZoom])
                .on("zoom", this._zoomed.bind(this)))
            .on("wheel", function () { d3.event.preventDefault();});

        this.trackStack = trackStack;
        this.viewportOverlay = viewportOverlay;

        this._resized();
    }
}