import { scaleLinear, scaleIdentity } from "d3-scale";
import { zip } from "d3-array";
import { inferType } from "vega-loader";

import { getMarks } from "../../view/viewUtils";
import SimpleTrack from "../simpleTrack";
import BandScale from "../../utils/bandScale";
import fisheye from "../../utils/fisheye";
import transition, {
    easeLinear,
    normalizedEase,
    easeInOutQuad,
    easeInOutSine,
    easeInQuad
} from "../../utils/transition";
import clientPoint from "../../utils/point";
import AttributePanel from "./attributePanel";
import { shallowArrayEquals } from "../../utils/arrayUtils";
import DataSource from "../../data/dataSource";
import contextMenu from "../../contextMenu";

const defaultStyles = {
    paddingInner: 0.2, // Relative to sample height
    paddingOuter: 0.2,

    attributeWidth: 12, // in pixels
    attributePaddingInner: 0.05,

    naColor: "#D8D8D8",

    fontSize: 12,
    fontFamily: "sans-serif",

    horizontalSpacing: 10, // TODO: Find a better place

    height: null // Use "flex-grow: 1" if no height has been specified
};

function extractAttributes(row) {
    const attributes = Object.assign({}, row);
    delete attributes.sample;
    delete attributes.displayName;
    return attributes;
}

/**
 * @param {any[]} flatSamples
 */
function processSamples(flatSamples) {
    return flatSamples.map(row => ({
        id: row.sample,
        displayName: row.displayName || row.sample,
        attributes: extractAttributes(row)
    }));
}

/**
 * A track that displays one or more samples as sub-tracks.
 *
 * @typedef {Object} Sample
 * @prop {string} id
 * @prop {string} displayName
 * @prop {Object[]} attributes Arbitrary sample specific attributes
 */
export default class SampleTrack extends SimpleTrack {
    /**
     *
     * @param {import("../../genomeSpy").default } genomeSpy
     * @param {object} config
     * @param {import("../../view/view").default} viewRoot
     */
    constructor(genomeSpy, config, viewRoot) {
        super(genomeSpy, config, viewRoot);

        this.styles = Object.assign({}, defaultStyles, config.styles);

        this.attributePanel = new AttributePanel(this);

        /**
         * Global transform for y axis (Samples)
         *
         * @type {?function(number):number}
         * @property {function(number):number} invert
         */
        this.yTransform = scaleIdentity();
    }

    /**
     *
     * @param {Sample[]} samples
     */
    setSamples(samples) {
        // TODO: Support dynamic configuration

        /**
         * A map of sample objects
         *
         * @type {Map<string, Sample>}
         */
        this.samples = new Map(samples.map(sample => [sample.id, sample]));

        /**
         * A mapping that specifies the order of the samples.
         *
         * TODO: Implement "SampleManager" with ordering, filtering and unit tests
         *
         * @type {string[]}
         */
        this.sampleOrder = samples.map(s => s.id);

        /**
         * Keep track of sample set mutations.
         * TODO: Consider Redux
         *
         * @type {string[][]}
         */
        this.sampleOrderHistory = [[...this.sampleOrder]];
    }

    /**
     * Returns the minimum width that accommodates the labels on the Y axis.
     * The axis area of sampleTrack contains sample labels and sample-specific
     * attributes.
     *
     * @returns {number} The width
     */
    getMinAxisWidth() {
        return this.attributePanel.getMinWidth();
    }

    resizeCanvases(layout) {
        super.resizeCanvases(layout);

        this.attributePanel.resizeCanvases(layout.axis);
    }

    /**
     * @param {HTMLElement} trackContainer
     */
    async initialize(trackContainer) {
        await super.initialize(trackContainer);

        if (this.config.samples) {
            const sampleDataSource = new DataSource(
                this.config.samples.data,
                this.genomeSpy.config.baseUrl
            );
            this.setSamples(
                processSamples(await sampleDataSource.getUngroupedData())
            );
        } else {
            const resolution = this.view.getResolution("sample");
            if (resolution) {
                this.setSamples(
                    resolution.getDataDomain().map(s => ({
                        id: s,
                        displayName: s,
                        attributes: []
                    }))
                );
            }
        }

        if (!this.samples) {
            throw new Error("No samples defined!"); // TODO: How to fix?
        }

        this.trackContainer.className = "sample-track";

        /** @type {BandScale} */
        this.sampleScale = new BandScale();
        this.sampleScale.domain(this.sampleOrder);
        this.sampleScale.paddingInner = this.styles.paddingInner;
        this.sampleScale.paddingOuter = this.styles.paddingOuter;

        this.viewportMouseTracker.on(
            "contextmenu",
            this.createContextMenu.bind(this)
        );

        this.attributePanel.initialize();
        this.initializePeek();
        this.initializeFisheye();

        this.genomeSpy.on("layout", () => {
            this.attributePanel.renderLabels();
            this.attributePanel.renderAttributeLabels();
        });

        // TODO: Reorganize:
        document.body.addEventListener("keydown", event => {
            if (event.key >= "1" && event.key <= "9") {
                const index = event.key.charCodeAt(0) - "1".charCodeAt(0);
                this.sortSamples(s => Object.values(s.attributes)[index]);
            } else if (event.code == "Backspace") {
                this.backtrackSamples();
            }
        });
    }

    // TODO: Unify shortcut key handling!

    initializePeek() {
        let persistentPeek = false;

        /** @type {MouseEvent} */
        let lastMouseEvent = null;

        const minWidth = 30;
        const zero = 1;
        let zoomFactor = zero;

        let origin = 0;

        const State = {
            CLOSED: 0,
            TRANSITIONING: 1,
            OPEN: 2
        };

        let state = State.CLOSED;

        const zoomListener = /** @param {import("../../utils/zoom").ZoomEvent} zoomEvent */ zoomEvent => {
            if (zoomEvent.deltaY && !zoomEvent.isPinching()) {
                const scrollFactor =
                    this.trackContainer.clientHeight * zoomFactor;

                origin = Math.max(
                    0,
                    Math.min(1, origin - zoomEvent.deltaY / scrollFactor)
                );

                render();
                zoomEvent.stop();
            }
        };

        const render = () => {
            this.renderViewport();
            this.attributePanel.renderLabels();
        };

        const closePeek = () => {
            if (state != State.OPEN) {
                return;
            }
            state = State.TRANSITIONING;

            this.genomeSpy.zoom.popListener();

            transition({
                duration: 100,
                from: zoomFactor,
                to: zero,
                onUpdate: /** @param {number} value */ value => {
                    zoomFactor = value;
                    render();
                }
            }).then(() => {
                state = State.CLOSED;
                this.yTransform = scaleIdentity();
                render();
            });
        };

        const openPeek = () => {
            if (state != State.CLOSED) {
                return;
            }
            state = State.TRANSITIONING;

            origin =
                clientPoint(this.glCanvas, lastMouseEvent)[1] /
                this.trackContainer.clientHeight;

            this.yTransform = y => (y - origin) * zoomFactor + origin;
            this.yTransform.invert = x =>
                (origin * (zoomFactor - 1) + x) / zoomFactor;

            this.genomeSpy.zoom.pushListener(zoomListener);

            transition({
                duration: 230,
                from: zero,
                to: Math.max(
                    1,
                    minWidth /
                        this.trackContainer.clientHeight /
                        this.sampleScale.getBandWidth()
                ),
                easingFunction: easeInQuad,
                onUpdate: /** @param {number} value */ value => {
                    zoomFactor = value;
                    render();
                }
            }).then(() => {
                state = State.OPEN;
            });
        };

        const moveListener = /** @param {MouseEvent} event */ event => {
            lastMouseEvent = event;
            if (this.fisheye) {
                focus();
            }
        };

        this.genomeSpy.container.addEventListener("mousemove", moveListener);
        // Ad hoc key binding. TODO: Make this more abstract
        document.body.addEventListener("keydown", event => {
            if (!event.repeat && event.code == "KeyZ") {
                if (!persistentPeek) {
                    openPeek();
                    persistentPeek = event.shiftKey;
                } else if (event.shiftKey) {
                    closePeek();
                    persistentPeek = false;
                } else {
                    persistentPeek = false;
                }
            }
        });

        document.body.addEventListener("keyup", event => {
            if (event.code == "KeyZ" && !persistentPeek && !event.shiftKey) {
                closePeek();
            }
        });
    }

    /**
     * Initializes fisheye functionality.
     */
    initializeFisheye() {
        /** @type {MouseEvent} */
        let lastMouseEvent = null;
        let persistentFisheye = false;

        const render = () => {
            this.renderViewport();
            this.attributePanel.renderLabels();
        };

        const focus = () => {
            this.fisheye.focus(
                clientPoint(this.glCanvas, lastMouseEvent)[1] /
                    this.glCanvas.clientHeight
            );
            render();
        };

        const moveListener = /** @param {MouseEvent} event */ event => {
            lastMouseEvent = event;
            if (this.fisheye) {
                focus();
            }
        };

        this.genomeSpy.container.addEventListener("mousemove", moveListener);

        const minWidth = 35;
        const zero = 0.01;
        let zoomFactor = zero;

        const closeFisheye = () => {
            transition({
                duration: 100,
                from: zoomFactor,
                to: zero,
                onUpdate: /** @param {number} value */ value => {
                    this.fisheye.distortion(value);
                    zoomFactor = value;
                    focus();
                }
            }).then(() => {
                this.fisheye = undefined;
                this.yTransform = scaleIdentity();
                render();
            });
        };

        const openFisheye = () => {
            this.fisheye = fisheye();
            this.fisheye.radius(150 / this.glCanvas.clientHeight);

            this.yTransform = this.fisheye;
            this.yTransform.invert = /** @param {number} x */ x => x;

            transition({
                duration: 150,
                from: zero,
                to: Math.max(
                    1,
                    minWidth /
                        this.sampleScale.getBandWidth() /
                        this.glCanvas.clientHeight
                ),
                //easingFunction: easeOutElastic,
                onUpdate: /** @param {number} value */ value => {
                    this.fisheye.distortion(value);
                    zoomFactor = value;
                    focus();
                }
            });
        };

        // Ad hoc key binding. TODO: Make this more abstract
        document.body.addEventListener("keydown", event => {
            if (!event.repeat && event.code == "KeyE") {
                if (!persistentFisheye) {
                    openFisheye();
                    persistentFisheye = event.shiftKey;
                } else if (event.shiftKey) {
                    closeFisheye();
                    persistentFisheye = false;
                } else {
                    persistentFisheye = false;
                }
            }
        });

        document.body.addEventListener("keyup", event => {
            if (
                event.code == "KeyE" &&
                this.fisheye &&
                !persistentFisheye &&
                !event.shiftKey
            ) {
                closeFisheye();
            }
        });
    }

    /**
     * @param {number[]} point
     */
    findSampleAt(point) {
        // If space between bands get too small, find closest to make opening
        // of the context menu easier
        const findClosest =
            (this.glCanvas.clientHeight / this.sampleScale.getDomain().length) *
                this.sampleScale.paddingOuter <
            2.5;

        const sampleId = this.sampleScale.invert(
            this.yTransform.invert(point[1] / this.glCanvas.clientHeight),
            findClosest
        );
        return sampleId ? this.samples.get(sampleId) : null;
    }

    /**
     * Returns the datum (actually the mark spec) at the specified point
     *
     * @param {number[]} point
     */
    findDatumAndMarkAt(point) {
        const [x, y] = point;

        const sampleId = this.sampleScale.invert(
            this.yTransform.invert(y / this.glCanvas.clientHeight)
        );

        if (!sampleId) {
            return null;
        }

        const bandInterval = this.sampleScale.scale(sampleId);

        for (const mark of getMarks(this.view).reverse()) {
            if (mark.properties.tooltip !== null) {
                const datum = mark.findDatum(
                    sampleId,
                    x,
                    y,
                    bandInterval
                        .transform(this.yTransform)
                        .transform(y => y * this.glCanvas.clientHeight)
                );
                if (datum) {
                    return { datum, mark };
                }
            }
        }
    }

    /**
     *
     * @param {object} datum
     * @param {MouseEvent} mouseEvent
     * @param {number[]} point
     */
    createContextMenu(datum, mouseEvent, point) {
        /** @type {import("../../contextMenu").MenuItem[]} */
        let items = [];

        const scaledX = this.genomeSpy.rescaledX.invert(point[0]);

        for (const mark of getMarks(this.view)) {
            if (mark.properties && mark.properties.sorting) {
                items.push({
                    label: mark.unitView.spec.title || "- No title -",
                    type: "header"
                });

                for (const field of mark.properties.sorting.fields) {
                    items.push({
                        label: `Sort by ${field}`,
                        callback: () =>
                            this.sortSamplesByLocus(mark, scaledX, field)
                    });
                }
            }
        }

        contextMenu({ items }, mouseEvent);
    }

    /**
     *
     * @param {import("../../marks/mark").default} mark
     * @param {number} pos locus in continuous domain
     * @param {string} attribute
     */
    sortSamplesByLocus(mark, pos, attribute) {
        const getAttribute = d => (d ? d[attribute] : undefined);

        const values = this.sampleOrder.map(id =>
            getAttribute(mark.findDatumAt(id, pos))
        );

        const isValid = x => x != null && x === x;

        // nulls & undefineds break sorting
        const sanitize =
            inferType(values) == "number"
                ? d => (isValid(d) ? d : -Infinity)
                : d => (isValid(d) ? d : "");

        const valuesBySample = new Map(
            zip(this.sampleOrder, values.map(sanitize))
        );

        const accessor = sample => valuesBySample.get(sample.id);

        this.sortSamples(accessor);
    }

    /**
     *
     * @param {function(Sample):number} attributeAccessor
     */
    sortSamples(attributeAccessor) {
        let sortedSampleIds = this.getSamplesSortedByAttribute(
            attributeAccessor,
            false
        );

        if (shallowArrayEquals(sortedSampleIds, this.sampleOrder)) {
            sortedSampleIds = this.getSamplesSortedByAttribute(
                attributeAccessor,
                true
            );
        }

        this.updateSamples(sortedSampleIds);
    }

    backtrackSamples() {
        if (this.sampleOrderHistory.length > 1) {
            this.sampleOrderHistory.pop();

            const sampleIds = this.sampleOrderHistory[
                this.sampleOrderHistory.length - 1
            ];

            const targetSampleScale = this.sampleScale.clone();
            targetSampleScale.domain(sampleIds);

            this.animateSampleTransition(
                this.sampleScale,
                targetSampleScale,
                true
            ).then(() => {
                this.sampleOrder = sampleIds;
                this.sampleScale = targetSampleScale;
                this.renderViewport();
                this.attributePanel.renderLabels();
            });
        }
    }

    /**
     * Updates the visible set of samples. Animates the transition.
     *
     * @param {string[]} sampleIds
     */
    updateSamples(sampleIds) {
        // Do nothing if new samples equals the old samples
        if (
            shallowArrayEquals(
                sampleIds,
                this.sampleOrderHistory[this.sampleOrderHistory.length - 1]
            )
        ) {
            return;
        }

        // If new samples appear to reverse the last action, backtrack in history
        if (
            this.sampleOrderHistory.length > 1 &&
            shallowArrayEquals(
                sampleIds,
                this.sampleOrderHistory[this.sampleOrderHistory.length - 2]
            )
        ) {
            this.sampleOrderHistory.pop();
        } else {
            this.sampleOrderHistory.push(sampleIds);
        }

        const targetSampleScale = this.sampleScale.clone();
        targetSampleScale.domain(sampleIds);

        this.animateSampleTransition(this.sampleScale, targetSampleScale).then(
            () => {
                this.sampleOrder = sampleIds;
                this.sampleScale = targetSampleScale;
                this.renderViewport();
                this.attributePanel.renderLabels();
            }
        );
    }

    /**
     * @param {BandScale} from
     * @param {BandScale} to
     * @param {boolean} reverse
     */
    animateSampleTransition(from, to, reverse = false) {
        from = this.addCollapsedBands(to, from);
        to = this.addCollapsedBands(from, to);

        if (reverse) {
            [from, to] = [to, from];
        }

        const yDelay = scaleLinear()
            .domain([0, 0.4])
            .clamp(true);
        const xDelay = scaleLinear()
            .domain([0.15, 1])
            .clamp(true);

        const yEase = normalizedEase(easeInOutQuad);
        const xEase = normalizedEase(easeInOutSine);

        this.attributePanel.sampleMouseTracker.clear();
        this.viewportMouseTracker.clear();

        getMarks(this.view).forEach(layer => layer.onBeforeSampleAnimation());

        return transition({
            from: reverse ? 1 : 0,
            to: reverse ? 0 : 1,
            duration: reverse ? 500 : 1200,
            easingFunction: easeLinear,
            onUpdate: value => {
                //const samplePositionResolver = id => from.scale(id)
                //    .mix(to.scale(id), yEase(yDelay(value)));

                //const easingFunction = value => yEase(yDelay(value))

                /** @type {RenderOptions} */
                const options = {
                    leftScale: from,
                    rightScale: to,
                    yTransitionProgress: yEase(yDelay(value)),
                    xTransitionProgress: xEase(xDelay(value))
                };

                this.renderViewport(options);
                this.attributePanel.renderLabels(options);
            }
        }).then(() =>
            getMarks(this.view).forEach(layer => layer.onAfterSampleAnimation())
        );
    }

    /**
     * Adds missing keys to the target scale as collapsed bands
     *
     * @param {BandScale} source A scale that contains additional keys missing from the target
     * @param {BandScale} target The scale that will be supplemented with collapsed bands
     */
    addCollapsedBands(source, target) {
        const targetDomain = [...target.getDomain()];
        const targetWidths = Array(targetDomain.length).fill(1); // TODO: get from target

        let lastInsertionPoint = -1;

        // This is O(n^2), which may be a problem with gigantic sample sets

        for (let key of source.getDomain()) {
            const targetIndex = targetDomain.indexOf(key);
            if (targetIndex >= 0) {
                lastInsertionPoint = targetIndex;
            } else {
                lastInsertionPoint++;
                targetDomain.splice(lastInsertionPoint, 0, key);
                targetWidths.splice(lastInsertionPoint, 0, 0);
            }
        }

        const supplementedScale = target.clone();
        supplementedScale.domain(targetDomain, targetWidths);
        return supplementedScale;
    }

    /**
     *
     * @param {function} attributeAccessor
     * @param {boolean} [descending]
     * @returns {string[]} ids of sorted samples
     */
    getSamplesSortedByAttribute(attributeAccessor, descending = false) {
        const replaceNaN = x =>
            typeof x == "number" && isNaN(x) ? -Infinity : x === null ? "" : x;

        return [...this.sampleOrder].sort((a, b) => {
            let av = replaceNaN(attributeAccessor(this.samples.get(a)));
            let bv = replaceNaN(attributeAccessor(this.samples.get(b)));

            if (descending) {
                [av, bv] = [bv, av];
            }

            if (av < bv) {
                return -1;
            } else if (av > bv) {
                return 1;
            } else {
                return 0;
            }
        });
    }

    /**
     *
     * @typedef {Object} RenderOptions
     * @property {BandScale} leftScale
     * @property {BandScale} rightScale
     * @property {number} yTransitionProgress
     * @property {number} xTransitionProgress
     *
     * @param {RenderOptions} [options]
     */
    renderViewport(options) {
        const gl = this.gl;

        const normalize = /** @param {number} x */ x => x;

        const leftScale = (options && options.leftScale) || this.sampleScale;
        const rightScale = (options && options.rightScale) || this.sampleScale;
        const xTransitionProgress =
            (options && options.xTransitionProgress) || 0;
        const yTransitionProgress =
            (options && options.yTransitionProgress) || 0;

        //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const globalUniforms = {
            ...this.getDomainUniforms(),
            transitionOffset: xTransitionProgress,
            zoomLevel: this.genomeSpy.getExpZoomLevel()
        };

        const samples = leftScale
            .getDomain()
            .map(sampleId => {
                const bandLeft = leftScale
                    .scale(sampleId)
                    .mix(rightScale.scale(sampleId), yTransitionProgress)
                    .transform(this.yTransform)
                    .transform(normalize);

                const bandRight = leftScale
                    .scale(sampleId)
                    .transform(this.yTransform)
                    .transform(normalize);

                return {
                    sampleId,
                    uniforms: {
                        yPosLeft: [bandLeft.lower, bandLeft.width()],
                        yPosRight: [bandRight.lower, bandRight.width()]
                    }
                };
            })
            .filter(
                sample =>
                    (sample.uniforms.yPosLeft[0] <= 1 &&
                        sample.uniforms.yPosLeft[0] +
                            sample.uniforms.yPosLeft[1] >=
                            0) ||
                    (sample.uniforms.yPosRight[0] <= 1 &&
                        sample.uniforms.yPosRight[0] +
                            sample.uniforms.yPosRight[1] >=
                            0)
            );

        for (const mark of getMarks(this.view)) {
            mark.render(samples, globalUniforms);
        }
    }
}
