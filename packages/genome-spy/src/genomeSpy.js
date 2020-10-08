import "array-flat-polyfill";

import scaleLocus from "./genome/scaleLocus";
import { scale as vegaScale } from "vega-scale";
import { interpolateZoom } from "d3-interpolate";
import { loader as vegaLoader } from "vega-loader";

import EventEmitter from "eventemitter3";
import Interval from "./utils/interval";
import { Zoom, Transform } from "./utils/zoom";
import "./styles/genome-spy.scss";
import Tooltip from "./tooltip";
import transition from "./utils/transition";

import Genome from "./genome/genome";

import RealCoordinateSystem from "./realCoordinateSystem";
import AccessorFactory from "./encoder/accessor";
import {
    getFlattenedViews,
    isViewSpec,
    createView,
    resolveScales,
    isImportSpec,
    initializeData,
    addAxisWrappers
} from "./view/viewUtils";
import DataSource from "./data/dataSource";
import UnitView from "./view/unitView";
import ImportView from "./view/importView";
import createDomain from "./utils/domainArray";

import { tickStep } from "d3-array";
import { format as d3format } from "d3-format";
import WebGLHelper from "./gl/webGLHelper";
import AxisWrapperView from "./view/axisWrapperView";
import MouseTracker2 from "./mouseTracker2";

/**
 * @typedef {import("./spec/view").UnitSpec} UnitSpec
 * @typedef {import("./spec/view").ViewSpec} ViewSpec
 * @typedef {import("./spec/view").ImportSpec} ImportSpec
 * @typedef {import("./spec/view").VConcatSpec} TrackSpec
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

        // TODO: Move to CoordinateSystem
        this.maxUnitZoom = 30;

        this.accessorFactory = new AccessorFactory();

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

    getXResolution() {
        // TODO: Proper search. More complex hierarchies may be used later on...
        return (this.viewRoot instanceof AxisWrapperView
            ? this.viewRoot.child
            : this.viewRoot
        ).getResolution("x");
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
        let domain = this.getXResolution().getDomain();
        if (domain) {
            return Interval.fromArray(domain);
        }

        return new Interval(0, 1);
    }

    getViewportDomainString() {
        if (!this.rescaledX) {
            return "";
        }

        return this.coordinateSystem.formatInterval(
            this.getViewportDomain().intersect(this.getDomain())
        );
    }

    /**
     * Returns the current zoom level. [0, 1]
     */
    getLinearZoomLevel() {
        return 0;
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
        return 1;
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
                this._zoomWithTransform(intervalToTransform(interval));
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
    async search(string) {
        const domainFinder = {
            search: string => this.coordinateSystem.parseInterval(string)
        };

        // Search tracks
        const interval = [domainFinder, ...this.tracks]
            .map(t => t.search(string))
            .find(i => i);

        if (interval) {
            await this.zoomTo(interval);
        } else {
            throw `No matches found for "${string}"`;
        }
    }

    /** @deprecated */
    _getSampleTracks() {
        return [];
    }

    /**
     * Backtracks in sample filtering and ordering
     */
    backtrackSamples() {
        // TODO: Handle multiple SampleTracks somehow
        const sampleTrack = this._getSampleTracks()[0];
        if (sampleTrack) {
            sampleTrack.backtrackSamples();
        }
    }

    isSomethingToBacktrack() {
        // TODO: Extract history handling into a class or something
        const sampleTrack = this._getSampleTracks()[0];
        return sampleTrack && sampleTrack.sampleOrderHistory.length > 1;
    }

    /**
     * Broadcast a message to all views
     *
     * @param {string} type
     * @param {any} [payload]
     */
    broadcast(type, payload) {
        const message = { type, payload };
        this.viewRoot.visit(view => view.handleBroadcast(message));
    }

    _prepareContainer() {
        this._glHelper = new WebGLHelper(this.container);
        this._glHelper.addEventListener("beforerender", () =>
            this.broadcast("layout")
        );
        this._glHelper.addEventListener("render", () => {
            this.renderAll();
        });

        this.loadingMessageElement = document.createElement("div");
        this.loadingMessageElement.className = "loading-message";
        this.loadingMessageElement.innerHTML = `<div class="message">Loading...</div>`;
        this.container.appendChild(this.loadingMessageElement);

        this.tooltip = new Tooltip(this.container);

        this.container.classList.add("genome-spy");
        this.container.classList.add("loading");

        this.loadingMessageElement
            .querySelector(".message")
            .addEventListener("transitionend", () => {
                /** @type {HTMLElement} */ (this.loadingMessageElement).style.display =
                    "none";
            });
    }

    /**
     * Unregisters all listeners, removes all created dom elements, removes all css classes from the container
     */
    destroy() {
        /*
        for (const e of this._listeners) {
            e.target.removeEventListener(e.type, e.listener);
        }
        */

        this.container.classList.remove("genome-spy");
        this.container.classList.remove("loading");

        throw new Error("destroy() not properly implemented");
    }

    // TODO: Come up with a sensible name. And maybe this should be called at the end of the constructor.
    async launch() {
        this._prepareContainer();

        try {
            // Register scaleLocus to Vega-Scale.
            // The Locus scale is not actually continuous but its domain can be adjusted in continuous manner.
            vegaScale("locus", scaleLocus, ["continuous"]);

            if (this.config.genome) {
                this.coordinateSystem = new Genome(this.config.genome);

                // TODO: Hierarchy of data providers, i.e. limit visibility to a subtree
                this.registerNamedDataProvider(name => {
                    if (name == "genomeAxisTicks") {
                        return this._generateTicks();
                    }
                });
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
                    ),
                glHelper: this._glHelper
            };

            /** @type {import("./spec/view").ConcatSpec & RootConfig} */
            const rootSpec = this.config;

            // Import external tracks
            /*
            if (isVConcatSpec(rootSpec)) {
                await processImports(rootSpec);
            }
            */

            // Create the view hierarchy
            /** @type {import("./view/view").default} */
            this.viewRoot = createView(rootSpec, context);

            // Resolve scales, i.e., if possible, pull them towards the root
            resolveScales(this.viewRoot);

            // Wrap unit or layer views that need axes
            this.viewRoot = addAxisWrappers(this.viewRoot);

            /** @type {UnitView[]} */
            const unitViews = [];
            this.viewRoot.visit(view => {
                if (view instanceof UnitView) {
                    unitViews.push(view);
                }
            });

            // If the coordinate system has a hard extent, use it
            if (this.coordinateSystem.getExtent()) {
                this.viewRoot
                    .getResolution("x")
                    .setDomain(
                        createDomain(
                            "quantitative",
                            this.coordinateSystem.getExtent().toArray()
                        )
                    );
            }

            // Load and transform all data
            await initializeData(this.viewRoot);

            // Compile shaders, handle textures, etc.
            // TODO: Move above initializeData. However, scales need domains before they can be created...
            const graphicsInitialized = Promise.all(
                unitViews.map(view => view.mark.initializeGraphics())
            );

            unitViews.forEach(view => view.mark.initializeEncoders());
            unitViews.forEach(view => view.mark.updateGraphicsData());

            this.zoom = new Zoom(e => this.broadcast("zoom", e));
            this.zoom.attachZoomEvents(this._glHelper.canvas);

            await graphicsInitialized;

            this._glHelper.render();

            return this;
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

    renderAll() {
        const samples = [
            {
                sampleId: "default",
                uniforms: {
                    yPosLeft: [0, 1],
                    yPosRight: [0, 1]
                }
            }
        ];

        this.viewRoot.visit(view => {
            if (view instanceof UnitView) {
                view.mark.render(samples);
            }
        });
    }

    // TODO: Find a proper place
    _generateTicks() {
        // TODO: Extract from spec
        const fontSize = 12;

        // GenomeSpy uses the same coordinate logic as USCS GenomeBrowser_
        // "1-start, fully-closed" = coordinates positioned within the web-based UCSC Genome Browser.
        // "0-start, half-open" = coordinates stored in database tables.
        const labelValueOffset = 1;

        const getViewWidth = () => this.layout.viewport.width();

        /////////////

        const scale = this.getZoomedScale();
        if (!scale) {
            return [];
        }

        const cm = /** @type {Genome} */ (this.coordinateSystem).chromMapper;

        // TODO: Consider moving to Track base class
        const viewportInterval = Interval.fromArray(scale.range());
        const domainInterval = Interval.fromArray(scale.domain());

        const locusTickFormat =
            domainInterval.width() > 5e7 ? d3format(".3s") : d3format(",");

        // A really crude approximation. TODO: Provide some font metrics through the text mark
        const maxLocusLabelWidth = fontSize * 0.6 * "123,000,000".length;
        const maxChromLabelWidth = fontSize * 0.6 * "chr99".length;

        const maxTickCount = Math.min(
            20,
            Math.floor(getViewWidth() / maxLocusLabelWidth / 2.0)
        );

        const step = tickStep(
            domainInterval.lower,
            domainInterval.upper,
            maxTickCount
        );

        const minChrom = cm.getChromosome(
            cm.toChromosomal(domainInterval.lower).chromosome
        );
        const maxChrom = cm.getChromosome(
            cm.toChromosomal(domainInterval.upper).chromosome
        );

        const ticks = [];

        for (let i = minChrom.index; i <= maxChrom.index; i++) {
            const chrom = cm.getChromosomes()[i];
            //const lower = Math.max(minChrom.continuousStart, domainInterval.lower);

            for (let pos = step; pos < chrom.size; pos += step) {
                ticks.push({
                    chrom: chrom.name,
                    pos: pos + chrom.continuousStart,
                    text: locusTickFormat(pos + labelValueOffset)
                });
            }
        }

        return ticks;
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
 * @param {import("./spec/view").ConcatSpec} trackSpec
 */
async function processImports(trackSpec) {
    // TODO: Process nested TracksViews too

    // eslint-disable-next-line require-atomic-updates
    trackSpec.concat = await Promise.all(
        trackSpec.concat.map(spec => {
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
