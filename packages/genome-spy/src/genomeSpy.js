import "array-flat-polyfill";

import { scaleLinear } from "d3-scale";
import { interpolateZoom } from "d3-interpolate";
import { loader as vegaLoader } from "vega-loader";

import EventEmitter from "eventemitter3";
import Interval from "./utils/interval";
import { Zoom, Transform } from "./utils/zoom";
import "./styles/genome-spy.scss";
import Tooltip from "./tooltip";
import transition from "./utils/transition";

import Genome from "./genome/genome";

import SampleTrack from "./tracks/sampleTrack/sampleTrack";
import AxisTrack from "./tracks/axisTrack";
import CytobandTrack from "./tracks/cytobandTrack";
import GeneTrack from "./tracks/geneTrack";
import SimpleTrack from "./tracks/simpleTrack";
import RealCoordinateSystem from "./realCoordinateSystem";
import AccessorFactory from "./encoder/accessor";
import {
    isViewSpec,
    createView,
    resolveScales,
    isImportSpec,
    initializeData,
    isTracksSpec
} from "./view/viewUtils";
import DataSource from "./data/dataSource";
import UnitView from "./view/unitView";
import TracksView from "./view/tracksView";
import ImportView from "./view/importView";
import createDomain from "./utils/domainArray";

/**
 * @type {Record<String, typeof import("./tracks/track").default>}
 */
const trackTypes = {
    cytobands: CytobandTrack,
    genomeAxis: AxisTrack,
    geneAnnotation: GeneTrack
};

/**
 * @typedef {import("./spec/view").UnitSpec} UnitSpec
 * @typedef {import("./spec/view").ViewSpec} ViewSpec
 * @typedef {import("./spec/view").ImportSpec} ImportSpec
 * @typedef {import("./spec/view").TracksSpec} TrackSpec
 * @typedef {import("./spec/view").RootSpec} RootSpec
 * @typedef {import("./spec/view").RootConfig} RootConfig
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

        /** @type {(function(string):object[])[]} */
        this.namedDataProviders = [];
    }

    on(...args) {
        // TODO: A mixin or multiple inheritance would be nice
        this.eventEmitter.on(...args);
    }

    /**
     *
     * @param {function(string):object[]} provider
     */
    registerNamedDataProvider(provider) {
        this.namedDataProviders.unshift(provider);
    }

    /**
     *
     * @param {string} name
     */
    getNamedData(name) {
        for (const provider of this.namedDataProviders) {
            const data = provider(name);
            if (data) {
                return data;
            }
        }
    }

    /**
     * @param {Transform} transform
     */
    _zoomed(transform) {
        this.rescaledX = transform.rescale(this.xScale);
        this.eventEmitter.emit("zoom", this.getViewportDomain());
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
        let domain = this.viewRoot.resolutions["x"].getDomain();
        if (domain) {
            return Interval.fromArray(domain);
        }

        return new Interval(0, 1);
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

        const intervalToTransform = interval =>
            new Transform()
                .scale(
                    this.layout.viewport.width() /
                        (x(interval.upper) - x(interval.lower))
                )
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
                this.zoom.zoomTo(intervalToTransform(interval));
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
        const interval = [domainFinder]
            .concat(this.tracks)
            .map(t => t.search(string))
            .find(i => i);

        return new Promise((resolve, reject) => {
            if (interval) {
                this.zoomTo(interval).then(() => resolve());
            } else {
                reject(`No matches found for "${string}"`);
            }
        });
    }

    _resized() {
        const cs = window.getComputedStyle(this.container, null);
        const width =
            this.container.clientWidth -
            parseFloat(cs.paddingLeft) -
            parseFloat(cs.paddingRight);

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

        this.zoom.scaleExtent = [
            1,
            this.coordinateSystem.getExtent()
                ? this.getDomain().width() / this.maxUnitZoom
                : Infinity
        ];

        this.eventEmitter.emit("layout", this.layout);
    }

    _prepareContainer() {
        this.loadingMessageElement = document.createElement("div");
        this.loadingMessageElement.className = "loading-message";
        this.loadingMessageElement.innerHTML = `<div class="message">Loading...</div>`;
        this.container.appendChild(this.loadingMessageElement);

        this._listeners = [
            {
                target: window,
                type: "resize",
                listener: this._resized.bind(this)
            },
            {
                target: window,
                type: "mousemove",
                listener: () => {
                    if (window.devicePixelRatio != this._dpr) {
                        this._dpr = window.devicePixelRatio;
                        this._resized();
                    }
                }
            },
            // Eat all context menu events that have not been caught by any track.
            // Prevents annoying browser default context menues from opening when
            // the user did not quite hit the target.
            {
                target: this.container,
                type: "contextmenu",
                listener: event => event.preventDefault()
            }
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

            /** @type {import("./view/viewUtils").ViewContext} */
            const context = {
                coordinateSystem: this.coordinateSystem,
                accessorFactory: this.accessorFactory,
                genomeSpy: this, // TODO: An interface instead of a GenomeSpy
                getDataSource: (config, baseUrl) =>
                    new DataSource(
                        config,
                        baseUrl,
                        this.getNamedData.bind(this)
                    )
            };

            /** @type {import("./spec/view").TracksSpec & RootConfig} */
            const rootSpec = this.config;

            // Import external tracks
            if (isTracksSpec(rootSpec)) {
                await processImports(rootSpec);
            }

            // Create the view hierarchy
            this.viewRoot = createView(rootSpec, context);

            // Resolve scales, i.e., if possible, pull them towards the root
            resolveScales(this.viewRoot);

            // If the coordinate system has a hard extent, use it
            if (this.coordinateSystem.getExtent()) {
                this.viewRoot.resolutions["x"].setDomain(
                    createDomain(
                        "quantitative",
                        this.coordinateSystem.getExtent().toArray()
                    )
                );
            }

            // Load an transform all data
            await initializeData(this.viewRoot);

            this.viewRoot.visit(view => {
                if (view instanceof UnitView) {
                    view.mark.initializeEncoders();
                }
            });

            this._createTracks();

            // Create container and initialize the the tracks, i.e. load the data and create WebGL buffers
            await Promise.all(
                this.tracks.map(track => {
                    const trackContainer = document.createElement("div");
                    trackContainer.className = "genome-spy-track";
                    this.trackStack.appendChild(trackContainer);

                    return track.initialize(trackContainer);
                })
            );

            // TODO: Support other scales too
            this.xScale = scaleLinear().domain(this.getDomain().toArray());

            // Zoomed scale
            this.rescaledX = this.xScale;

            // Initiate layout calculation and render the tracks
            this._resized();
        } catch (reason) {
            const message = `${
                reason.view ? `At "${reason.view.getPathString()}": ` : ""
            }${reason.toString()}`;
            console.error(message);
            console.error(reason.stack);
            createMessageBox(this.container, message);
        } finally {
            this.container.classList.remove("loading");
        }
    }

    /**
     * Creates the track instances
     */
    _createTracks() {
        /** @type {import("./tracks/track").default[]} */
        this.tracks = [];

        /** @type {import("./spec/view").ViewSpecBase[]} */
        this.viewRoot.visit(view => {
            if (view instanceof ImportView) {
                const name = view.spec.import.name;
                if (name) {
                    if (!trackTypes[name]) {
                        throw new Error(`Unknown track name: ${name}`);
                    }
                    // Currently, all named imports are custom, hardcoded tracks
                    this.tracks.push(new trackTypes[name](this, view.spec));
                }
            } else if (
                !(view instanceof TracksView) &&
                (view.parent instanceof TracksView || view.parent == null)
            ) {
                const Track = view.resolutions["sample"]
                    ? SampleTrack
                    : SimpleTrack;

                const track = new Track(this, view.spec, view);

                this.tracks.push(track);
            }
        });
    }
}

/**
 * @param {import("./spec/view").ImportSpec} spec
 * @param {string} baseUrl
 */
async function importExternalTrack(spec, baseUrl) {
    if (!spec.import.url) {
        throw new Error(
            "Cannot import, not an external track: " + JSON.stringify(spec)
        );
    }

    const loader = vegaLoader({ baseURL: baseUrl });
    const url = spec.import.url;

    const importedSpec = JSON.parse(
        await loader.load(url).catch(e => {
            throw new Error(
                `Could not load imported track spec: ${url} \nReason: ${e.message}`
            );
        })
    );

    if (isViewSpec(importedSpec)) {
        importedSpec.baseUrl = (await loader.sanitize(url)).href.match(
            /^.*\//
        )[0];
        return importedSpec;
    } else {
        // TODO: Support nested TrackViews (i.e., grouped tracks)
        throw new Error(
            `The imported spec "${url}" is not a view spec: ${JSON.stringify(
                spec
            )}`
        );
    }
}

/**
 * @param {import("./spec/view").TracksSpec} trackSpec
 */
async function processImports(trackSpec) {
    // TODO: Process nested TracksViews too

    // eslint-disable-next-line require-atomic-updates
    trackSpec.tracks = await Promise.all(
        trackSpec.tracks.map(spec => {
            if (isImportSpec(spec) && spec.import.url) {
                return importExternalTrack(spec, trackSpec.baseUrl);
            } else {
                return spec;
            }
        })
    );
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
