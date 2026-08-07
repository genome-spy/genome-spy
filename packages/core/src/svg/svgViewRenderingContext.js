import { peek } from "../utils/arrayUtils.js";
import {
    normalizeClipOptions,
    prepareMarkClipOptionsFromClip,
} from "../view/renderingContext/clipOptions.js";
import ViewRenderingContext from "../view/renderingContext/viewRenderingContext.js";
import {
    createSvgAnchorCullBounds,
    createSvgVisibleBounds,
    hasVisibleArea,
} from "./svgBounds.js";
import { getSvgData } from "./markData.js";
import { renderMarkSvg } from "./renderers/index.js";
import { createSvgElement, SVG_NS } from "./svgElement.js";
import { formatSvgNumber, formatSvgUnitless } from "./svgNumber.js";
import { createRectHatchPattern } from "./rectHatchPattern.js";
import {
    createLinkArcFadeMask,
    normalizeLinkArcFade,
} from "./linkArcFadeMask.js";

/**
 * @typedef {object} SvgRenderingOptions
 * @prop {number} width Logical export width.
 * @prop {number} height Logical export height.
 * @prop {string | null} [background] Export background. Null is transparent.
 */

/**
 * @typedef {object} ViewStackEntry
 * @prop {import("../view/view.js").default} view
 * @prop {SVGGElement} node
 * @prop {import("../view/layout/rectangle.js").default} coords
 */

/**
 * @typedef {object} SvgSampleFacetBatch
 * @prop {WeakMap<import("../view/view.js").default, SVGGElement>} viewGroups
 * @prop {WeakMap<import("../marks/mark.js").default, Map<string, SVGGElement>>} markGroups
 * @prop {Set<SVGGElement>} markGroupElements
 */

/**
 * @typedef {object} SvgMarkRenderingOptions
 * @prop {import("../view/layout/rectangle.js").default} coords
 * @prop {object[]} data
 * @prop {SVGGElement} group
 * @prop {import("./svgBounds.js").SvgBounds} visibleBounds
 * @prop {import("./svgBounds.js").SvgBounds} anchorCullBounds
 * @prop {number} viewOpacity
 * @prop {(fade: SvgViewportEdgeFade) => string | undefined} getViewportEdgeFadeMaskUrl
 * @prop {(shadow: SvgShadow) => string} getShadowFilterUrl
 * @prop {(hatch: SvgRectHatch) => string} getRectHatchPatternUrl
 * @prop {(fade: SvgLinkArcFade) => string | undefined} getLinkArcFadeMaskUrl
 * @prop {(gradient: SvgLegendGradient) => string} getLegendGradientUrl
 * @prop {(message: string) => void} warn
 */

/**
 * @typedef {{width: number, distance: number}} SvgViewportEdgeFadeSide
 * @typedef {{top: SvgViewportEdgeFadeSide, right: SvgViewportEdgeFadeSide, bottom: SvgViewportEdgeFadeSide, left: SvgViewportEdgeFadeSide}} SvgViewportEdgeFade
 * @typedef {{blur: number, offsetX: number, offsetY: number}} SvgShadow
 * @typedef {{type: string, fill: string, fillOpacity: number, stroke: string, strokeOpacity: number, strokeWidth: number}} SvgRectHatch
 * @typedef {{p1: [number, number], p4: [number, number], distances: [number, number]}} SvgLinkArcFade
 * @typedef {{offset: number, color: string}} SvgGradientStop
 * @typedef {{x1: number, y1: number, x2: number, y2: number, stops: SvgGradientStop[]}} SvgLegendGradient
 */

/**
 * Rendering context for constructing a hierarchical SVG document.
 */
export default class SvgViewRenderingContext extends ViewRenderingContext {
    /** @type {SVGSVGElement} */
    #svg;

    /** @type {SVGDefsElement} */
    #defs;

    /** @type {ViewStackEntry[]} */
    #viewStack = [];

    /** @type {Map<string, string>} */
    #clipPaths = new Map();

    /** @type {WeakMap<import("../view/view.js").default, string>} */
    #edgeFadeMasks = new WeakMap();

    /** @type {Map<string, string>} */
    #shadowFilters = new Map();

    /** @type {Map<string, string>} */
    #rectHatchPatterns = new Map();

    /** @type {Map<string, string>} */
    #linkArcFadeMasks = new Map();

    /** @type {Set<string>} */
    #warnings = new Set();

    /** @type {SvgSampleFacetBatch | undefined} */
    #sampleFacetBatch;

    #nextViewId = 0;
    #nextClipId = 0;
    #nextMaskId = 0;
    #nextFilterId = 0;
    #nextPatternId = 0;
    #nextGradientId = 0;

    /**
     * @param {import("../types/rendering.js").GlobalRenderingOptions} globalOptions
     * @param {SvgRenderingOptions} options
     */
    constructor(globalOptions, options) {
        super(globalOptions);

        this.width = options.width;
        this.height = options.height;
        const width = formatSvgNumber(options.width);
        const height = formatSvgNumber(options.height);

        this.#svg = createSvgElement("svg", {
            xmlns: SVG_NS,
            width,
            height,
            viewBox: `0 0 ${width} ${height}`,
        });
        this.#defs = createSvgElement("defs");
        this.#svg.appendChild(this.#defs);

        if (options.background != null) {
            this.#svg.appendChild(
                createSvgElement("rect", {
                    width,
                    height,
                    fill: options.background,
                    "data-export-background": "",
                })
            );
        }
    }

    /** @override */
    beginSampleFacetBatch() {
        if (this.#sampleFacetBatch) {
            throw new Error("Nested sample facet batches are not supported.");
        }
        this.#sampleFacetBatch = {
            viewGroups: new WeakMap(),
            markGroups: new WeakMap(),
            markGroupElements: new Set(),
        };
    }

    /** @override */
    endSampleFacetBatch() {
        const batch = this.#sampleFacetBatch;
        if (!batch) {
            throw new Error("No sample facet batch is active.");
        }
        for (const group of batch.markGroupElements) {
            if (!group.childElementCount) {
                group.remove();
            }
        }
        this.#sampleFacetBatch = undefined;
    }

    /**
     * @param {import("../view/view.js").default} view
     * @param {import("../view/layout/rectangle.js").default} coords
     * @override
     */
    pushView(view, coords) {
        const path = view.getPathString();
        const batch = this.#sampleFacetBatch;
        let group = batch?.viewGroups.get(view);
        if (group) {
            if (group.parentNode !== this.currentNode) {
                throw new Error(
                    `Sample-faceted view was rendered under multiple parents: ${path}`
                );
            }
        } else {
            group = createSvgElement("g", {
                id: createViewGroupId(view.name, this.#nextViewId++),
                "data-name": view.name,
                "data-view-path": path,
            });
            const title = createSvgElement("title");
            title.textContent = path;
            group.appendChild(title);
            this.currentNode.appendChild(group);
            batch?.viewGroups.set(view, group);
        }
        this.#viewStack.push({ view, node: group, coords });
    }

    /**
     * @param {import("../view/view.js").default} view
     * @override
     */
    popView(view) {
        const entry = this.#viewStack.pop();
        if (entry?.view !== view) {
            throw new Error("Unbalanced SVG view rendering context stack.");
        }
    }

    /**
     * @param {import("../marks/mark.js").default} mark
     * @param {import("../types/rendering.js").RenderingOptions} options
     * @override
     */
    renderMark(mark, options) {
        if (mark.unitView.getEffectiveOpacity() <= 0) {
            return;
        }

        const inheritedClip = normalizeClipOptions(options);
        const markClip = prepareMarkClipOptionsFromClip(
            inheritedClip,
            mark.properties.clip,
            this.currentCoords
        );
        const batched = this.#sampleFacetBatch != null;
        const batchClipPathUrl = batched
            ? this.getClipPathUrl(markClip)
            : undefined;
        const group = this.#getMarkGroup(mark, batchClipPathUrl);
        const visibleBounds = createSvgVisibleBounds(
            this.width,
            this.height,
            markClip
        );
        if (!hasVisibleArea(visibleBounds)) {
            return;
        }
        const anchorCullBounds = createSvgAnchorCullBounds(
            this.currentCoords,
            inheritedClip,
            mark.properties.cullByVisibleRange
        );

        const data = getSvgData(mark, options);
        /**
         * @param {import("../view/layout/rectangle.js").default} coords
         * @param {object[]} facetData
         */
        const render = (coords, facetData) =>
            renderMarkSvg(mark, {
                coords,
                data: facetData,
                group,
                visibleBounds,
                anchorCullBounds,
                viewOpacity: mark.unitView.getEffectiveOpacity(),
                getViewportEdgeFadeMaskUrl: (fade) =>
                    this.getViewportEdgeFadeMaskUrl(fade),
                getShadowFilterUrl: (shadow) => this.getShadowFilterUrl(shadow),
                getRectHatchPatternUrl: (hatch) =>
                    this.getRectHatchPatternUrl(hatch),
                getLinkArcFadeMaskUrl: (fade) =>
                    this.getLinkArcFadeMaskUrl(fade),
                getLegendGradientUrl: (gradient) =>
                    this.getLegendGradientUrl(gradient),
                warn: (message) =>
                    this.#warnings.add(
                        `${message} View: ${mark.unitView.getPathString()}`
                    ),
            });

        if (options.sampleFacetRenderingOptions) {
            render(
                getSampleFacetCoords(
                    this.currentCoords,
                    options.sampleFacetRenderingOptions
                ),
                data
            );
        } else if (mark.encoders.facetIndex) {
            for (const [facetIndex, facetData] of groupDataByFacetIndex(
                mark.encoders.facetIndex,
                data
            )) {
                const locSize = this.#getSampleFacetPosition(mark, facetIndex);
                if (locSize) {
                    render(
                        getSampleFacetCoords(this.currentCoords, {
                            locSize,
                            pixelToUnit: 1,
                        }),
                        facetData
                    );
                } else {
                    this.#warnings.add(
                        `SVG export could not resolve sample facet index ${facetIndex}. View: ${mark.unitView.getPathString()}`
                    );
                }
            }
        } else {
            render(this.currentCoords, data);
        }
        if (!batched && group.childElementCount > 0) {
            const clipPathUrl = this.getClipPathUrl(markClip);
            if (clipPathUrl) {
                group.setAttribute("clip-path", clipPathUrl);
            }
            this.currentNode.appendChild(group);
        }
    }

    /**
     * Returns a shared mark group while a sample-facet batch is active. The
     * first occurrence establishes its position in the logical view hierarchy.
     *
     * @param {import("../marks/mark.js").default} mark
     * @param {string | undefined} clipPathUrl
     */
    #getMarkGroup(mark, clipPathUrl) {
        const batch = this.#sampleFacetBatch;
        if (!batch) {
            return createSvgElement("g", {
                "data-mark-type": mark.getType(),
            });
        }

        let groupsByClip = batch.markGroups.get(mark);
        if (!groupsByClip) {
            groupsByClip = new Map();
            batch.markGroups.set(mark, groupsByClip);
        }

        const clipKey = clipPathUrl ?? "";
        let group = groupsByClip.get(clipKey);
        if (group) {
            if (group.parentNode !== this.currentNode) {
                throw new Error(
                    `Sample-faceted mark was rendered under multiple parents: ${mark.unitView.getPathString()}`
                );
            }
        } else {
            group = createSvgElement("g", {
                "data-mark-type": mark.getType(),
            });
            if (clipPathUrl) {
                group.setAttribute("clip-path", clipPathUrl);
            }
            this.currentNode.appendChild(group);
            groupsByClip.set(clipKey, group);
            batch.markGroupElements.add(group);
        }
        return group;
    }

    /**
     * @param {import("../types/rendering.js").ClipOptions | undefined} clip
     * @returns {string | undefined}
     */
    getClipPathUrl(clip) {
        if (!clip) {
            return undefined;
        }

        const rect = clip.rect.flatten();
        const x = clip.clipX ? rect.x : 0;
        const y = clip.clipY ? rect.y : 0;
        const width = clip.clipX ? rect.width : this.width;
        const height = clip.clipY ? rect.height : this.height;
        const formatted = [x, y, width, height].map(formatSvgNumber);
        const key = formatted.join(",");
        let id = this.#clipPaths.get(key);

        if (!id) {
            id = "clip-" + this.#nextClipId++;
            const clipPath = createSvgElement("clipPath", {
                id,
                clipPathUnits: "userSpaceOnUse",
            });
            clipPath.appendChild(
                createSvgElement("rect", {
                    x: formatted[0],
                    y: formatted[1],
                    width: formatted[2],
                    height: formatted[3],
                })
            );
            this.#defs.appendChild(clipPath);
            this.#clipPaths.set(key, id);
        }

        return `url(#${id})`;
    }

    /**
     * @param {import("../marks/mark.js").default} mark
     * @param {number} index
     * @returns {import("../view/layout/flexLayout.js").LocSize | undefined}
     */
    #getSampleFacetPosition(mark, index) {
        for (const view of mark.unitView.getLayoutAncestors()) {
            const position = view.getSampleFacetPosition(index);
            if (position) {
                return position;
            }
        }
        return undefined;
    }

    /**
     * @param {SvgShadow} shadow
     * @returns {string}
     */
    getShadowFilterUrl(shadow) {
        const stdDeviation = formatSvgNumber(Math.max(shadow.blur / 2.5, 0.25));
        const dx = formatSvgNumber(shadow.offsetX);
        const dy = formatSvgNumber(shadow.offsetY);
        const key = [stdDeviation, dx, dy].join(",");
        let id = this.#shadowFilters.get(key);
        if (!id) {
            id = "shadow-" + this.#nextFilterId++;
            const filter = createSvgElement("filter", {
                id,
                x: 0,
                y: 0,
                width: formatSvgNumber(this.width),
                height: formatSvgNumber(this.height),
                filterUnits: "userSpaceOnUse",
                primitiveUnits: "userSpaceOnUse",
                "color-interpolation-filters": "sRGB",
            });
            filter.appendChild(
                createSvgElement("feGaussianBlur", {
                    stdDeviation,
                })
            );
            filter.appendChild(
                createSvgElement("feOffset", {
                    dx,
                    dy,
                })
            );
            this.#defs.appendChild(filter);
            this.#shadowFilters.set(key, id);
        }

        return `url(#${id})`;
    }

    /**
     * @param {SvgRectHatch} hatch
     * @returns {string}
     */
    getRectHatchPatternUrl(hatch) {
        const key = JSON.stringify([
            hatch.type,
            hatch.fill,
            formatSvgUnitless(hatch.fillOpacity),
            hatch.stroke,
            formatSvgUnitless(hatch.strokeOpacity),
            formatSvgUnitless(hatch.strokeWidth),
        ]);
        let id = this.#rectHatchPatterns.get(key);
        if (!id) {
            id = "rect-hatch-" + this.#nextPatternId++;
            this.#defs.appendChild(createRectHatchPattern(id, hatch));
            this.#rectHatchPatterns.set(key, id);
        }
        return `url(#${id})`;
    }

    /**
     * @param {SvgLegendGradient} options
     * @returns {string}
     */
    getLegendGradientUrl(options) {
        const id = "legend-gradient-" + this.#nextGradientId++;
        const gradient = createSvgElement("linearGradient", {
            id,
            gradientUnits: "userSpaceOnUse",
            x1: formatSvgNumber(options.x1),
            y1: formatSvgNumber(options.y1),
            x2: formatSvgNumber(options.x2),
            y2: formatSvgNumber(options.y2),
        });
        for (const stop of options.stops) {
            gradient.appendChild(
                createSvgElement("stop", {
                    offset: formatSvgUnitless(stop.offset),
                    "stop-color": stop.color,
                })
            );
        }
        this.#defs.appendChild(gradient);
        return `url(#${id})`;
    }

    /**
     * @param {SvgLinkArcFade} options
     * @returns {string | undefined}
     */
    getLinkArcFadeMaskUrl(options) {
        const fade = normalizeLinkArcFade(
            options.p1,
            options.p4,
            options.distances
        );
        if (!fade) {
            return undefined;
        }

        let id = this.#linkArcFadeMasks.get(fade.key);
        if (!id) {
            id = "link-arc-fade-" + this.#nextMaskId++;
            const { gradient, mask } = createLinkArcFadeMask(
                id,
                this.width,
                this.height,
                fade
            );
            this.#defs.appendChild(gradient);
            this.#defs.appendChild(mask);
            this.#linkArcFadeMasks.set(fade.key, id);
        }
        return `url(#${id})`;
    }

    /**
     * Returns a mask that applies the text mark's viewport-edge fades. The mask
     * is cached by view because its geometry is independent of mark instances.
     *
     * @param {SvgViewportEdgeFade} fade
     * @returns {string | undefined}
     */
    getViewportEdgeFadeMaskUrl(fade) {
        const activeEdges = Object.entries(fade).filter(
            ([, side]) => side.width > 0 && Number.isFinite(side.distance)
        );
        if (!activeEdges.length) {
            return undefined;
        }

        const entry = peek(this.#viewStack);
        if (!entry) {
            throw new Error("No current view in SVG rendering context.");
        }

        let id = this.#edgeFadeMasks.get(entry.view);
        if (!id) {
            id = "edge-fade-" + this.#nextMaskId++;
            const width = formatSvgNumber(this.width);
            const height = formatSvgNumber(this.height);
            const mask = createSvgElement("mask", {
                id,
                x: 0,
                y: 0,
                width,
                height,
                maskUnits: "userSpaceOnUse",
                maskContentUnits: "userSpaceOnUse",
                "mask-type": "luminance",
            });
            mask.appendChild(
                createSvgElement("rect", {
                    width,
                    height,
                    fill: "white",
                })
            );

            for (const [edge, side] of activeEdges) {
                const gradientId = id + "-" + edge;
                const gradient = createEdgeFadeGradient(
                    gradientId,
                    /** @type {"top" | "right" | "bottom" | "left"} */ (edge),
                    side,
                    entry.coords
                );
                this.#defs.appendChild(gradient);
                mask.appendChild(
                    createSvgElement("rect", {
                        width,
                        height,
                        fill: `url(#${gradientId})`,
                    })
                );
            }

            this.#defs.appendChild(mask);
            this.#edgeFadeMasks.set(entry.view, id);
        }

        return `url(#${id})`;
    }

    /** @returns {SVGSVGElement} */
    getSvg() {
        return this.#svg;
    }

    /** @returns {string[]} */
    getWarnings() {
        return Array.from(this.#warnings);
    }

    /** @returns {SVGElement} */
    get currentNode() {
        return peek(this.#viewStack)?.node ?? this.#svg;
    }

    /** @returns {import("../view/layout/rectangle.js").default} */
    get currentCoords() {
        const entry = peek(this.#viewStack);
        if (!entry) {
            throw new Error("No current view in SVG rendering context.");
        }
        return entry.coords;
    }
}

/**
 * Produces unique XML-safe identifiers that vector editors can also use as
 * recognizable group names.
 *
 * @param {string} name
 * @param {number} index
 */
function createViewGroupId(name, index) {
    const slug = name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const safeName = /^[A-Za-z_]/.test(slug)
        ? slug
        : slug
          ? "view-" + slug
          : "view";
    return `${safeName}-${index}`;
}

/**
 * Reproduces the uniform sample-facet transform from sampleFacet.glsl using
 * SVG view coordinates. The inherited clip intentionally remains tied to the
 * original view: SampleView clips all samples at its GridChild boundary, not
 * at the boundary of each sample row.
 *
 * @param {import("../view/layout/rectangle.js").default} coords
 * @param {import("../types/rendering.js").SampleFacetRenderingOptions | undefined} facet
 */
function getSampleFacetCoords(coords, facet) {
    if (!facet) {
        return coords;
    }

    const location = facet.locSize.location * facet.pixelToUnit;
    const size = facet.locSize.size * facet.pixelToUnit;
    return coords.modify({
        y: () => coords.y + location * coords.height,
        height: () => size * coords.height,
    });
}

/**
 * @param {import("../types/encoder.js").Encoder} facetIndexEncoder
 * @param {object[]} data
 * @returns {Map<number, object[]>}
 */
function groupDataByFacetIndex(facetIndexEncoder, data) {
    /** @type {Map<number, object[]>} */
    const facets = new Map();
    for (const datum of data) {
        const index = +facetIndexEncoder(datum);
        let facet = facets.get(index);
        if (!facet) {
            facet = [];
            facets.set(index, facet);
        }
        facet.push(datum);
    }
    return facets;
}

/**
 * The opaque black end of the gradient erases the white mask, while the
 * transparent end leaves it unchanged. Gradient padding extends the fade
 * beyond the viewport edge when a negative distance is configured.
 *
 * @param {string} id
 * @param {"top" | "right" | "bottom" | "left"} edge
 * @param {SvgViewportEdgeFadeSide} side
 * @param {import("../view/layout/rectangle.js").default} coords
 */
function createEdgeFadeGradient(id, edge, side, coords) {
    const zero =
        edge == "top"
            ? coords.y + side.distance
            : edge == "right"
              ? coords.x2 - side.distance
              : edge == "bottom"
                ? coords.y2 - side.distance
                : coords.x + side.distance;
    const horizontal = edge == "left" || edge == "right";
    const direction = edge == "top" || edge == "left" ? 1 : -1;
    const one = zero + direction * side.width;
    const gradient = createSvgElement("linearGradient", {
        id,
        gradientUnits: "userSpaceOnUse",
        x1: formatSvgNumber(horizontal ? zero : 0),
        y1: formatSvgNumber(horizontal ? 0 : zero),
        x2: formatSvgNumber(horizontal ? one : 0),
        y2: formatSvgNumber(horizontal ? 0 : one),
    });
    gradient.appendChild(
        createSvgElement("stop", {
            offset: 0,
            "stop-color": "black",
            "stop-opacity": 1,
        })
    );
    gradient.appendChild(
        createSvgElement("stop", {
            offset: 1,
            "stop-color": "black",
            "stop-opacity": 0,
        })
    );
    return gradient;
}
