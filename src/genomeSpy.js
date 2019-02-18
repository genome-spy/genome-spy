import EventEmitter from "eventemitter3";
import * as d3 from 'd3';
import { chromMapper } from "./chromMapper";
import Interval from "./utils/interval";
import { Zoom, Transform } from "./utils/zoom";
import "./styles/genome-spy.scss";
import Tooltip from "./tooltip";
import transition, { easeLinear } from "./utils/transition";

/**
 * The actual browser without any toolbars etc
 */
export default class GenomeSpy {
    /**
     * 
     * @param {HTMLElement} container 
     * @param {import("./genome").Genome} genome 
     * @param {import("./tracks/track").default[]} tracks 
     */
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

        this.zoom = new Zoom(this._zoomed.bind(this));

        // TODO: A configuration object
        /** When zooming, the maximum size of a single discrete unit (nucleotide) in pixels */
        this.maxUnitZoom = 20;
    }

    on(...args) {
        // TODO: A mixin or multiple inheritance would be nice
        this.eventEmitter.on(...args);
    }

    _zoomed(transform) {
        this.rescaledX = transform.rescale(this.xScale);
        this.eventEmitter.emit('zoom', this.getViewportDomain());
    }

    getViewportDomain() {
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


    /**
     * 
     * @param {Interval} target 
     */
    zoomTo(target) {
        const x = this.xScale;
        const source = this.getViewportDomain();

        const intervalToTransform = interval => new Transform()
            .scale(this.layout.viewport.width() / (x(interval.upper) - x(interval.lower)))
            .translate(-x(interval.lower));

        const interpolateZoom = d3.interpolateZoom(
            [source.centre(), 0, source.width()],
            [target.centre(), 0, target.width()]
        );

        return transition({
            duration: 300 + interpolateZoom.duration * 0.07,
            //easingFunction: easeLinear,
            onUpdate: value => {
                const i = interpolateZoom(value);
                const interval = new Interval(i[0] - i[2] / 2, i[0] + i[2] / 2);
                this.zoom.zoomTo(intervalToTransform(interval))
            }
        });
    }


    _resized() {
        const aw = Math.ceil(this.getAxisWidth());
        const viewportWidth = this.container.clientWidth - aw;

        this.xScale.range([0, viewportWidth]);
        this.rescaledX.range([0, viewportWidth]);

        // The layout only deals with horizontal coordinates. The tracks take care of their height.
        // TODO: Implement LayoutBuilder
        this.layout = {
            axis: new Interval(0, aw),
            viewport: new Interval(aw, aw + viewportWidth)
        };

        this.zoom.scaleExtent = [1, this.chromMapper.extent().width() / this.container.clientWidth * this.maxUnitZoom];

        this.eventEmitter.emit('layout', this.layout);
    }


    // TODO: Come up with a sensible name. And maybe this should be called at the end of the constructor.
    launch() {
        window.addEventListener('resize', this._resized.bind(this), false);

        this.container.classList.add("genome-spy");

        const trackStack = document.createElement("div");
        trackStack.className = "track-stack";

        this.container.appendChild(trackStack);
        this.trackStack = trackStack;

        this.tooltip = new Tooltip(this.container);

        this.tracks.forEach(track => {
            const trackContainer = document.createElement("div");
            trackContainer.className = "genome-spy-track";
            trackStack.appendChild(trackContainer);

            track.initialize(this, trackContainer);
        });

        // Eat all context menu events that have not been caught by any track.
        // Prevents annoying browser default context menues from opening when
        // the user did not quite hit the target.
        this.container.addEventListener("contextmenu", event => event.preventDefault());

        this._resized();
    }
}