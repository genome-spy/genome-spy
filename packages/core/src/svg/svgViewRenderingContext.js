import { peek } from "../utils/arrayUtils.js";
import {
    normalizeClipOptions,
    prepareMarkClipOptionsFromClip,
} from "../view/renderingContext/clipOptions.js";
import ViewRenderingContext from "../view/renderingContext/viewRenderingContext.js";
import { createSvgVisibleBounds, hasVisibleArea } from "./svgBounds.js";
import { getSvgData } from "./markData.js";
import { renderMarkSvg } from "./renderers/index.js";
import { createSvgElement, SVG_NS } from "./svgElement.js";
import { formatSvgNumber } from "./svgNumber.js";

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
 * @typedef {object} SvgMarkRenderingOptions
 * @prop {import("../view/layout/rectangle.js").default} coords
 * @prop {object[]} data
 * @prop {SVGGElement} group
 * @prop {import("./svgBounds.js").SvgBounds} visibleBounds
 * @prop {number} viewOpacity
 * @prop {(message: string) => void} warn
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

    /** @type {Set<string>} */
    #warnings = new Set();

    #nextViewId = 0;
    #nextClipId = 0;

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

    /**
     * @param {import("../view/view.js").default} view
     * @param {import("../view/layout/rectangle.js").default} coords
     * @override
     */
    pushView(view, coords) {
        const path = view.getPathString();
        const group = createSvgElement("g", {
            id: "view-" + this.#nextViewId++,
            "data-view-name": view.name,
            "data-view-path": path,
        });
        const title = createSvgElement("title");
        title.textContent = path;
        group.appendChild(title);
        this.currentNode.appendChild(group);
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
        const visibleBounds = createSvgVisibleBounds(
            this.width,
            this.height,
            markClip
        );
        if (!hasVisibleArea(visibleBounds)) {
            return;
        }

        const group = createSvgElement("g", {
            "data-mark-type": mark.getType(),
        });

        renderMarkSvg(mark, {
            coords: this.currentCoords,
            data: getSvgData(mark, options),
            group,
            visibleBounds,
            viewOpacity: mark.unitView.getEffectiveOpacity(),
            warn: (message) =>
                this.#warnings.add(
                    `${message} View: ${mark.unitView.getPathString()}`
                ),
        });
        if (group.childElementCount > 0) {
            const clipPathUrl = this.getClipPathUrl(markClip);
            if (clipPathUrl) {
                group.setAttribute("clip-path", clipPathUrl);
            }
            this.currentNode.appendChild(group);
        }
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
        const key = [x, y, width, height].join(",");
        let id = this.#clipPaths.get(key);

        if (!id) {
            id = "clip-" + this.#nextClipId++;
            const clipPath = createSvgElement("clipPath", {
                id,
                clipPathUnits: "userSpaceOnUse",
            });
            clipPath.appendChild(
                createSvgElement("rect", {
                    x: formatSvgNumber(x),
                    y: formatSvgNumber(y),
                    width: formatSvgNumber(width),
                    height: formatSvgNumber(height),
                })
            );
            this.#defs.appendChild(clipPath);
            this.#clipPaths.set(key, id);
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

    /** @returns {string} */
    serialize() {
        return new XMLSerializer().serializeToString(this.#svg);
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
