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

import SampleTrack from "./tracks/sampleTrack/sampleTrack";
import AxisTrack from "./tracks/axisTrack";
import CytobandTrack from "./tracks/cytobandTrack";
import GeneTrack from "./tracks/geneTrack";
import SimpleTrack from './tracks/simpleTrack';
import RealCoordinateSystem from './realCoordinateSystem';
import AccessorFactory from './encoder/accessor';
import { isViewSpec, createView, resolveScales, isTrackSpec, isImportSpec } from './view/viewUtils';
import DataSource from './data/dataSource';

/**
 * @type {Record<String, typeof import("./tracks/track").default>}
 */
const trackTypes = {
    "cytobands": CytobandTrack,
    "genomeAxis": AxisTrack,
    "geneAnnotation": GeneTrack
};

/**
 * @typedef {import("spec/view").UnitSpec} UnitSpec
 * @typedef {import("spec/view").ViewSpec} ViewSpec
 * @typedef {import("spec/view").ImportSpec} ImportSpec
 * @typedef {import("spec/view").TrackSpec} TrackSpec
 * @typedef {import("spec/view").RootSpec} RootSpec
 * @typedef {import("spec/view").RootConfig} RootConfig
 */

/**
 * The actual browser without any toolbars etc
 */
export default class GenomeSpy {
    /**
     * 
     * @param {HTMLElement} container 
     * @param {RootSpec} config
     */
    constructor(container, config) {
        this.container = container;

        /** Root level configuration object */
        this.config = config;

        this.eventEmitter = new EventEmitter();

        this.zoom = new Zoom(this._zoomed.bind(this));

        // TODO: Move to CoordinateSystem
        this.maxUnitZoom = 30;

        /** @type {import("./tracks/Track").default[]} */
        this.tracks = [];

        this.accessorFactory = new AccessorFactory();

        /** @type {number} */
        this._dpr = window.devicePixelRatio;

        /** @type {import("./coordinateSystem").default} */
        this.coordinateSystem = null;

        /** @type {Map<string, Object[]>} Named datasets */
        this.datasets = new Map(); 
    }

    on(...args) {
        // TODO: A mixin or multiple inheritance would be nice
        this.eventEmitter.on(...args);
    }

    /**
     * @param {Transform} transform
     */
    _zoomed(transform) {
        this.rescaledX = transform.rescale(this.xScale);
        this.eventEmitter.emit('zoom', this.getViewportDomain());
    }

    /**
     * Returns the hard domain of the coordinate system if it is specified.
     * Otherwise returns the shared domain of the data.
     * 
     * TODO: Rename and emphasize X axis
     * TODO: Return DomainArray
     * TODO: Tracks should actually be views and X scale should be resolved as shared here
     * 
     * @return {Interval} the domain
     */
    getDomain() {
        // TODO: Compute from data when no hard extent is present
        let extent = this.coordinateSystem.getExtent();
        if (!extent) {
            /** @type {import("./utils/domainArray").DomainArray} */
            let domain;
            for (const track of this.tracks) {
                if (domain) {
                    const trackDomain = track.getXDomain();
                    if (trackDomain) {
                        domain.extendAll(trackDomain);
                    }
                } else {
                    domain = track.getXDomain();
                }
            }
            return Interval.fromArray(domain);
        }

        return extent || new Interval(0, 1);
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

    /**
     * Performs a search and zooms into the first matching interval.
     * Returns a promise that resolves when the search and the transition to the
     * matching interval are complete.
     * 
     * @param {string} string the search string
     * @returns A promise
     */
    search(string) {
        // TODO: Consider moving this function to GenomeSpy

        const domainFinder = {
            search: string => this.coordinateSystem.parseInterval(string)
        };

        // Search tracks
        const interval = [domainFinder].concat(this.tracks)
            .map(t => t.search(string))
            .find(i => i);

        return new Promise((resolve, reject) => {
            if (interval) {
                this.zoomTo(interval)
                    .then(() => resolve());

            } else {
                reject(`No matches found for "${string}"`);
            }
        });
    }

    _resized() {
        const cs = window.getComputedStyle(this.container, null);
        const width = this.container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);

        const aw = Math.ceil(this.getAxisWidth());
        const viewportWidth = width - aw;

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

    _prepareContainer() {
        this.loadingMessageElement = document.createElement("div");
        this.loadingMessageElement.className = "loading-message";
        this.loadingMessageElement.innerHTML = `<div class="message">Loading...</div>`;
        this.container.appendChild(this.loadingMessageElement);

        this._listeners = [
            { target: window, type: "resize", listener: this._resized.bind(this) },
            {
                target: window, type: "mousemove", listener: () => {
                    if (window.devicePixelRatio != this._dpr) {
                        this._dpr = window.devicePixelRatio;
                        this._resized();
                    }
                }
            },
            // Eat all context menu events that have not been caught by any track.
            // Prevents annoying browser default context menues from opening when
            // the user did not quite hit the target.
            { target: this.container, type: "contextmenu", listener: event => event.preventDefault() }
        ];

        for (const e of this._listeners) {
            e.target.addEventListener(e.type, e.listener);
        }

        const trackStack = document.createElement("div");
        trackStack.classList.add("track-stack");

        this.container.appendChild(trackStack);
        this.trackStack = trackStack;

        this.tooltip = new Tooltip(this.container);

        this.container.classList.add("genome-spy");
        this.container.classList.add("loading");
    }

    /**
     * Unregisters all listeners, removes all created dom elements, removes all css classes from the container
     */
    destroy() {
        for (const e of this._listeners) {
            e.target.removeEventListener(e.type, e.listener);
        }

        while (this.container.firstChild) {
            this.container.firstChild.remove();
        }

        this.container.classList.remove("genome-spy");
        this.container.classList.remove("loading");
    }

    // TODO: Come up with a sensible name. And maybe this should be called at the end of the constructor.
    async launch() {
        this._prepareContainer();

        try {
            if (this.config.genome) {
                this.coordinateSystem = new Genome(this.config.genome);
            } else {
                this.coordinateSystem = new RealCoordinateSystem();
            }
            await this.coordinateSystem.initialize(this);


            /** @type {import("view/viewUtils").ViewContext} */
            const baseContext = {
                coordinateSystem: this.coordinateSystem,
                accessorFactory: this.accessorFactory,
                genomeSpy: this, // TODO: An interface instead of a GenomeSpy
                getDataSource: config => new DataSource(config, this.config.baseUrl, this.datasets)
            };

            // If the top-level object is a view spec, wrap it in a track spec
            const rootWithTracks = wrapInTrack(this.config);

            // Create the tracks and their view hierarchies
            this.tracks = await Promise.all(rootWithTracks.tracks.map(spec => createTrack(spec, this, baseContext)));

            // Create container and initialize the the tracks, i.e. load the data and create WebGL buffers
            await Promise.all(this.tracks.map(track => {
                const trackContainer = document.createElement("div");
                trackContainer.className = "genome-spy-track";
                this.trackStack.appendChild(trackContainer);

                return track.initialize(trackContainer);

            }));

            // TODO: Support other scales too
            this.xScale = scaleLinear()
                .domain(this.getDomain().toArray());

            // Zoomed scale
            this.rescaledX = this.xScale;

            // Initiate layout calculation and render the tracks
            this._resized();

        } catch (reason) {
            console.error(reason.message);
            console.error(reason.stack);
            createMessageBox(this.container, reason.toString());

        } finally {
            this.container.classList.remove("loading");
        }
    }
}

/**
 * 
 * @param {RootSpec} rootSpec 
 * @returns {TrackSpec}
 */
function wrapInTrack(rootSpec) {
    // Ensure that we have at least one track
    if (isViewSpec(rootSpec)) {
        // TODO: Clean extra properties
        const trackSpec = /** @type {TrackSpec} */(rootSpec);
        trackSpec.tracks = [rootSpec];
        return trackSpec;

    } else if (isTrackSpec(rootSpec)) {
        return rootSpec;

    } else {
        throw new Error("The config root has no tracks nor views: " + JSON.stringify(rootSpec));
    }
}

/**
 * @param {import("spec/view").ViewSpec | import("spec/view").ImportSpec} spec
 * @param {GenomeSpy} genomeSpy
 * @param {import("view/viewUtils").ViewContext} baseContext
 */
async function createTrack(spec, genomeSpy, baseContext) {
    if (isImportSpec(spec)) {
        if (spec.import.name) {
            if (!trackTypes[spec.import.name]) {
                throw new Error(`Unknown track name: ${spec.import.name}`)
            }
            // Currently, all named imports are custom, hardcoded tracks
            return new trackTypes[spec.import.name](genomeSpy, spec);

        } else if (spec.import.url) {
            // Replace the current spec with an imported one

            const absolute = /^(http(s)?)?:\/\//.test(spec.import.url);
            const url = absolute ? spec.import.url : genomeSpy.config.baseUrl + "/" + spec.import.url;

            const importedSpec = await fetch(url, { credentials: 'same-origin' })
                .then(res => {
                    if (res.ok) {
                        return res.json();
                    }
                    throw new Error(`Could not load chrom sizes: ${url} \nReason: ${res.status} ${res.statusText}`);
                });

            // TODO: BaseUrl should be updated for the imported view
            if (isViewSpec(importedSpec)) {
                spec = importedSpec;
                spec.baseUrl = url.match(/^.*\//)[0];

            } else {
                throw new Error(`The imported spec "${url}" is not a view spec: ${JSON.stringify(spec)}`);
            }
        }

    }

    if (isViewSpec(spec)) {
        // We first create a view and then figure out if it needs faceting (SampleTrack)

        /** @type {import("view/viewUtils").ViewContext} */
        const context = {
            ...baseContext,
            // Hack for imported tracks, as their baseUrl needs to be updated
            getDataSource: config => new DataSource(config, spec.baseUrl || genomeSpy.config.baseUrl, genomeSpy.datasets)
        }

        const viewRoot = createView(spec, context);
        resolveScales(viewRoot);
        const Track = viewRoot.resolutions["sample"] ? SampleTrack : SimpleTrack;

        const track = new Track(genomeSpy, spec, viewRoot);
        context.track = track;

        return track;
    }

    throw new Error("Can't figure out which track to create: " + JSON.stringify(spec));
}

/**
 * 
 * @param {HTMLElement} container
 * @param {string} message 
 */
function createMessageBox(container, message) {
    // Uh, need a templating thingy
    const messageBox = document.createElement("div");
    messageBox.className = "message-box";
    const messageText = document.createElement("div");
    messageText.textContent = message;
    messageBox.appendChild(messageText);
    container.appendChild(messageBox);
}