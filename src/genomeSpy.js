import 'array-flat-polyfill';

import { scaleLinear } from 'd3-scale';
import { interpolateZoom } from 'd3-interpolate';

import EventEmitter from "eventemitter3";
import Interval from "./utils/interval";
import { Zoom, Transform } from "./utils/zoom";
import "./styles/genome-spy.scss";
import Tooltip from "./tooltip";
import transition, { easeLinear } from "./utils/transition";

import Genome from './genome/genome';
import { VisualMapperFactory } from './data/visualEncoders';

import SampleTrack from "./tracks/sampleTrack/sampleTrack";
import AxisTrack from "./tracks/axisTrack";
import CytobandTrack from "./tracks/cytobandTrack";
import GeneTrack from "./tracks/geneTrack";
import SimpleTrack from './tracks/simpleTrack';
import RealCoordinateSystem from './realCoordinateSystem';


// TODO: Figure out if these could be discovered automatically by WebPack or something
// TODO: Provide an API for registering new track types
const trackTypes = {
    "SimpleTrack": SimpleTrack,
    "SampleTrack": SampleTrack,
    "CytobandTrack": CytobandTrack,
    "AxisTrack": AxisTrack,
    "GeneTrack": GeneTrack
};


/**
 * The actual browser without any toolbars etc
 */
export default class GenomeSpy {
    /**
     * 
     * @param {HTMLElement} container 
     */
    constructor(container, config) {
        this.container = container;
        this.config = config;

        this.eventEmitter = new EventEmitter();

        this.zoom = new Zoom(this._zoomed.bind(this));

        // TODO: Move to CoordinateSystem
        this.maxUnitZoom = 30;

        /** @type {import("./tracks/Track").default[]} */
        this.tracks = [];

        this.visualMapperFactory = new VisualMapperFactory();

        this._dpr = window.devicePixelRatio;

        /** @type {import("./coordinateSystem").default} */
        this.coordinateSystem = null;
    }

    on(...args) {
        // TODO: A mixin or multiple inheritance would be nice
        this.eventEmitter.on(...args);
    }

    _zoomed(transform) {
        this.rescaledX = transform.rescale(this.xScale);
        this.eventEmitter.emit('zoom', this.getViewportDomain());
    }

    /**
     * Returns the hard domain of the coordinate system if it is specified.
     * Otherwise returns the shared domain of the data.
     * 
     * TODO: Rename and emphasize X axis
     * 
     * @return {Interval} the domain
     */
    getDomain() {
        // TODO: Compute from data whene no hard extent is present
        let domain = this.coordinateSystem.getExtent();
        if (!domain) {
            /** @type {import("./utils/interval").default} */
            let interval;
            for (const track of this.tracks) {
                if (interval) {
                    // Ugh, empty intervals could be useful here....
                    const trackInterval = track.getXDomain();
                    if (trackInterval) {
                        interval = interval.span(trackInterval);
                    }
                } else {
                    interval = track.getXDomain();
                }
            }
            return interval;
        }

        return domain || new Interval(0, 1);
    }

    /**
     * Returns the portion of the domain that is currently visible in the viewport
     * 
     * @return {Interval} the domain
     */
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
     * Returns the current zoom level. [0, 1]
     */
    getLinearZoomLevel() {
        const extent = this.coordinateSystem.getExtent();
        if (extent) {
            // TODO: Get extent from the data
            const b = extent.width();
            const y = this.getViewportDomain().width();
            const a = this.maxUnitZoom;

            return Math.log2(b / y) / Math.log2(b / a);
        }
    }

    /**
     * Returns the current zoom level, [1, Infinity)
     */
    getExpZoomLevel() {
        // TODO: Get from zoom object
        const b = this.getDomain().width();
        const y = this.getViewportDomain().width();
        
        return b / y;
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

        const interpolate = interpolateZoom(
            [source.centre(), 0, source.width()],
            [target.centre(), 0, target.width()]
        );

        return transition({
            duration: 300 + interpolate.duration * 0.07,
            //easingFunction: easeLinear,
            onUpdate: value => {
                const i = interpolate(value);
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

        this.zoom.scaleExtent = [1, this.getDomain().width() / this.maxUnitZoom || Infinity];

        this.eventEmitter.emit('layout', this.layout);
    }

    // TODO: Come up with a sensible name. And maybe this should be called at the end of the constructor.
    async launch() {
        this.loadingMessageElement = document.createElement("div");
        this.loadingMessageElement.className = "loading-message";
        this.loadingMessageElement.innerHTML = `<div class="message">Loading...</div>`;
        this.container.appendChild(this.loadingMessageElement);

        window.addEventListener('resize', this._resized.bind(this), false);

        window.addEventListener('mousemove', () => {
            if (window.devicePixelRatio != this._dpr) {
                this._dpr = window.devicePixelRatio;
                this._resized();
            }
        });

        // Eat all context menu events that have not been caught by any track.
        // Prevents annoying browser default context menues from opening when
        // the user did not quite hit the target.
        this.container.addEventListener("contextmenu", event => event.preventDefault());

        const trackStack = document.createElement("div");
        trackStack.classList.add("track-stack");

        this.container.appendChild(trackStack);
        this.trackStack = trackStack;

        this.tooltip = new Tooltip(this.container);

        this.container.classList.add("genome-spy");
        this.container.classList.add("loading");
        
        try {
            if (this.config.genome) {
                this.coordinateSystem = new Genome(this.config.genome);
            } else {
                this.coordinateSystem = new RealCoordinateSystem();
            }
            await this.coordinateSystem.initialize(this);

            this.tracks = this.config.tracks.map(trackConfig => new trackTypes[trackConfig.type](this, trackConfig));

        } catch (reason) {
            this.container.classList.remove("loading");
            console.error(reason.message);
            console.error(reason.stack);
            alert("Error: " + reason.toString());
            return;
        }
    
        await Promise.all(this.tracks.map(track => {
            const trackContainer = document.createElement("div");
            trackContainer.className = "genome-spy-track";
            trackStack.appendChild(trackContainer);

            return track.initialize(trackContainer);

        })).then(() => {
            this.xScale = scaleLinear()
                .domain(this.getDomain().toArray());

            // Zoomed scale
            this.rescaledX = this.xScale;

            this._resized();
            this.container.classList.remove("loading");

        }).catch(reason => {
            this.container.classList.remove("loading");
            console.error(reason.message);
            console.error(reason.stack);
            alert("Error: " + reason.toString());
        });
    }
}