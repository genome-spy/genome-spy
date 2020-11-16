import scaleLocus from "./genome/scaleLocus";
import { scale as vegaScale } from "vega-scale";
import { interpolateZoom } from "d3-interpolate";

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
    addDecorators,
    processImports
} from "./view/viewUtils";
import DataSource from "./data/dataSource";
import UnitView from "./view/unitView";
import ImportView from "./view/importView";
import createDomain from "./utils/domainArray";

import WebGLHelper from "./gl/webGLHelper";
import DecoratorView from "./view/decoratorView";
import MouseTracker2 from "./mouseTracker2";
import { parseSizeDef } from "./utils/layout/flexLayout";
import Rectangle from "./utils/layout/rectangle";
import DeferredViewRenderingContext from "./view/renderingContext/deferredViewRenderingContext";
import LayoutRecorderViewRenderingContext from "./view/renderingContext/layoutRecorderViewRenderingContext";
import CompositeViewRenderingContext from "./view/renderingContext/compositeViewRenderingContext";
import InteractionEvent from "./utils/interactionEvent";
import Point from "./utils/layout/point";

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
        //this.eventEmitter.on(...args);
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
        return (this.viewRoot instanceof DecoratorView
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
        this._glHelper.addEventListener("resize", () => this.computeLayout());
        this._glHelper.addEventListener("render", () => this.renderAll());

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
            // Loci are discrete but the scale's domain can be adjusted in a continuous manner.
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

            // Create the view hierarchy
            /** @type {import("./view/view").default} */
            this.viewRoot = createView(rootSpec, context);

            // Replace placeholder ImportViews with actual views.
            await processImports(this.viewRoot);

            // Resolve scales, i.e., if possible, pull them towards the root
            resolveScales(this.viewRoot);

            // Wrap unit or layer views that need axes
            this.viewRoot = addDecorators(this.viewRoot);

            /** @type {UnitView[]} */
            const unitViews = [];
            this.viewRoot.visit(view => {
                if (view instanceof UnitView) {
                    unitViews.push(view);
                }
            });

            // If the coordinate system has a hard extent, use it
            // TODO: Should be set for each scale. Breaks on independent scales!!
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

            /*
            this.zoom = new Zoom(e => {
                // TODO: Refactor mouse handling. Propagate raw events, mimic DOM.
                // Zooms and other behaviors should be handled at view levels.
                if (this.layout) {
                    this.layout.broadcastMouseEvent(e.mouseX, e.mouseY, {
                        type: "zoom",
                        payload: e
                    });
                }
            });

            this.zoom.attachZoomEvents(this._glHelper.canvas);
            */

            this.registerMouseEvents();

            this.computeLayout();

            await graphicsInitialized;

            this.renderAll();

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

    registerMouseEvents() {
        const canvas = this._glHelper.canvas;

        [
            "mousedown",
            "wheel",
            "click",
            "mousemove",
            "gesturechange",
            "contextmenu"
        ].forEach(type =>
            canvas.addEventListener(type, event => {
                if (this.layout && event instanceof MouseEvent) {
                    // Adapted from: https://github.com/d3/d3-selection/blob/master/src/point.js
                    const rect = canvas.getBoundingClientRect();
                    const point = new Point(
                        event.clientX - rect.left - canvas.clientLeft,
                        event.clientY - rect.top - canvas.clientTop
                    );

                    this.layout.dispatchInteractionEvent(
                        new InteractionEvent(point, event)
                    );
                }
            })
        );

        // Prevent text selections etc while dragging
        canvas.addEventListener("dragstart", event => event.stopPropagation());
    }

    computeLayout() {
        this.broadcast("layout");

        const canvasSize = this._glHelper.getLogicalCanvasSize();
        const root = this.viewRoot;

        /** @param {"width" | "height"} c */
        const getComponent = c =>
            (root.spec[c] && parseSizeDef(root.spec[c]).grow
                ? canvasSize[c]
                : root.getSize()[c].px) || canvasSize[c];

        this.deferredContext = new DeferredViewRenderingContext();
        const layoutRecorder = new LayoutRecorderViewRenderingContext();

        root.render(
            new CompositeViewRenderingContext(
                this.deferredContext,
                layoutRecorder
            ),
            new Rectangle(0, 0, getComponent("width"), getComponent("height"))
        );

        this.layout = layoutRecorder.getLayout();
    }

    renderAll() {
        // TODO: Move gl stuff to renderingContext
        const gl = this._glHelper.gl;
        gl.clear(gl.COLOR_BUFFER_BIT);

        this.deferredContext.renderDeferred();
    }
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
