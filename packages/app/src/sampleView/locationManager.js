import { createOrUpdateTexture } from "@genome-spy/core/gl/webGLHelper.js";
import { peek } from "@genome-spy/core/utils/arrayUtils.js";
import clamp from "@genome-spy/core/utils/clamp.js";
import { mapToPixelCoords } from "@genome-spy/core/view/layout/flexLayout.js";
import Padding from "@genome-spy/core/view/layout/padding.js";
import smoothstep from "@genome-spy/core/utils/smoothstep.js";
import transition from "@genome-spy/core/utils/transition.js";
import { easeCubicOut, easeExpOut } from "d3-ease";
import { getFlattenedGroupHierarchy } from "./state/sampleSlice.js";

export class LocationManager {
    /**
     * @typedef {import("@genome-spy/core/view/layout/flexLayout.js").LocSize} LocSize
     */

    /**
     * 0: Bird's eye view, 1: Closeup view, (0, 1): Transitioning between the two
     */
    #peekState = 0;

    #scrollOffset = 0;

    #scrollableHeight = 0;

    /** @type {WebGLTexture} */
    #facetTexture = undefined;

    /** @type {Float32Array} */
    #facetTextureData = undefined;

    /** @type {import("./sampleViewTypes.js").Locations} */
    #locations = undefined;

    /** @type {{fitted: import("./sampleViewTypes.js").Locations, scrollable: import("./sampleViewTypes.js").Locations}} */
    #baseLocations = undefined;

    /** @type {import("./sampleViewTypes.js").Locations} */
    #scrollableLocations;

    /** @type {import("./sampleViewTypes.js").LocationContext} */
    #locationContext;

    /** @type {{height: number, summaryHeight: number, sampleHierarchy: import("./state/sampleState.js").SampleHierarchy | undefined}} */
    #layoutInputs = {
        height: 0,
        summaryHeight: 0,
        sampleHierarchy: undefined,
    };

    #structuralDirty = true;

    #baseLayoutVersion = 0;

    // Cache of the inputs used to update interpolated locations.
    #dynamicInputs = {
        peekState: 0,
        scrollOffset: 0,
        baseVersion: -1,
    };

    // Cache of the inputs that affect facet texture updates.
    #facetTextureInputs = {
        baseVersion: -1,
        height: 0,
        peekState: 0,
        scrollOffset: 0,
        sampleCount: 0,
    };

    /**
     * @param {import("./sampleViewTypes.js").LocationContext} locationContext
     */
    constructor(locationContext) {
        this.#locationContext = locationContext;
    }

    isCloseup() {
        return this.#peekState === 1;
    }

    resetLocations() {
        // Layout inputs changed; force a structural rebuild on the next access.
        this.#structuralDirty = true;
        this.#locations = undefined;
        this.#baseLocations = undefined;
        this.#scrollableLocations = undefined;
        this.#baseLayoutVersion += 1;
        this.#dynamicInputs.baseVersion = -1;
    }

    reset() {
        this.#peekState = 0;
        this.resetLocations();
    }

    getPeekState() {
        return this.#peekState;
    }

    getScrollOffset() {
        return this.#scrollOffset;
    }

    /**
     * @param {number} value
     */
    setScrollOffset(value) {
        const maxScrollOffset = Math.max(
            0,
            this.#scrollableHeight - this.#locationContext.getHeight()
        );
        this.#scrollOffset = clamp(value, 0, maxScrollOffset);
    }

    getScrollableHeight() {
        return this.#scrollableHeight;
    }

    /**
     * @param {number} viewportHeight
     * @param {number} [summaryHeight]
     */
    getScrollMetrics(viewportHeight, summaryHeight = 0) {
        return computeScrollMetrics({
            viewportHeight,
            summaryHeight,
            scrollableHeight: this.#scrollableHeight,
            scrollOffset: this.#scrollOffset,
            peekState: this.#peekState,
        });
    }

    /**
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} viewportCoords
     * @param {number} [summaryHeight]
     */
    getScrollbarLayout(viewportCoords, summaryHeight = 0) {
        const {
            effectiveViewportHeight,
            contentHeight,
            effectiveScrollOffset,
        } = this.getScrollMetrics(viewportCoords.height, summaryHeight);

        const scrollbarViewportCoords = summaryHeight
            ? viewportCoords.modify({
                  y: () => viewportCoords.y + summaryHeight,
                  height: () => effectiveViewportHeight,
              })
            : viewportCoords.modify({
                  height: () => effectiveViewportHeight,
              });

        const contentCoords = scrollbarViewportCoords.modify({
            height: () => contentHeight,
        });

        return {
            viewportCoords: scrollbarViewportCoords,
            contentCoords,
            effectiveScrollOffset,
        };
    }

    /**
     *
     * @param {WheelEvent} wheelEvent
     */
    handleWheelEvent(wheelEvent) {
        this.setScrollOffset(this.#scrollOffset + wheelEvent.deltaY);
    }

    #callOnLocationUpdate() {
        const sampleHeight = this.#locations.samples[0]?.locSize.size ?? 0;
        this.#locationContext.onLocationUpdate({
            // TODO: Refactor to make acquiring sampleHeight easier
            sampleHeight,
        });
    }

    /**
     * @param {boolean} [open] open if true, close if false, toggle if undefined
     * @param {number} [mouseY] Mouse position in pixels
     * @param {string} [sampleId]
     */
    togglePeek(open, mouseY, sampleId) {
        if (this.#peekState > 0 && this.#peekState < 1) {
            // Transition is going on
            return;
        }

        if (open !== undefined && open == !!this.#peekState) {
            return;
        }

        if (!this.getLocations()) {
            return;
        }

        const viewContext = this.#locationContext.viewContext;
        const height = this.#locationContext.getHeight();

        /** @type {import("@genome-spy/core/utils/transition.js").TransitionOptions} */
        const props = {
            requestAnimationFrame: (callback) =>
                viewContext.animator.requestTransition(callback),
            onUpdate: (value) => {
                this.#peekState = Math.pow(value, 2);
                this.#ensureDynamicLocations();
                viewContext.animator.requestRender();
            },
            from: this.#peekState,
        };

        if (this.#peekState == 0) {
            let target;
            if (sampleId) {
                /** @param {LocSize} locSize */
                const getCentroid = (locSize) =>
                    locSize.location + locSize.size / 2;

                target = getCentroid(
                    this.#scrollableLocations.samples.find(
                        (sampleLocation) => sampleLocation.key == sampleId
                    ).locSize
                );
            } else {
                // Match sample summaries
                const groupInfo = this.getSummaryAt(mouseY);
                if (groupInfo) {
                    // TODO: Simplify now that target is available in groupLocations
                    target =
                        this.#scrollableLocations.summaries[groupInfo.index]
                            .locSize.location -
                        (groupInfo.location.locSize.location - mouseY);
                }
            }

            if (target) {
                this.#scrollOffset = target - mouseY;
            } else {
                // TODO: Find closest sample instead
                this.#scrollOffset = (this.#scrollableHeight - height) / 2;
            }

            if (this.#scrollableHeight > height) {
                transition({
                    ...props,
                    to: 1,
                    duration: 500,
                    easingFunction: easeExpOut,
                });
            } else {
                // No point to zoom out in peek. Indicate the request registration and
                // refusal with a discrete animation.

                /** @param {number} x */
                const bounce = (x) => (1 - Math.pow(x * 2 - 1, 2)) * 0.5;

                transition({
                    ...props,
                    from: 0,
                    to: 1,
                    duration: 300,
                    easingFunction: bounce,
                });
            }
        } else {
            transition({
                ...props,
                to: 0,
                duration: 400,
                easingFunction: easeCubicOut,
            });
        }
    }

    /**
     * @returns {import("./sampleViewTypes.js").Locations}
     */
    getLocations() {
        if (!this.#ensureDynamicLocations()) {
            return;
        }
        return this.#locations;
    }

    /**
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} coords
     */
    getGroupBackgroundRects(coords) {
        const groups = this.getLocations().groups;
        const maxDepth = groups
            .map((d) => d.key.depth)
            .reduce((a, b) => Math.max(a, b), 0);
        const leafGroups = groups.filter((d) => d.key.depth == maxDepth);

        const summaryHeight = this.#locationContext.getSummaryHeight();

        coords = coords.flatten();

        const clipRect =
            this.#locationContext.isStickySummaries() && summaryHeight > 0
                ? coords.shrink(new Padding(summaryHeight, 0, 0, 0))
                : coords;

        return [...leafGroups.values()].map((groupLocation) => {
            const y = () => {
                const gLoc = groupLocation.locSize.location;
                return coords.y + gLoc + summaryHeight;
            };

            return {
                coords: coords
                    .modify({
                        y,
                        height: () =>
                            groupLocation.locSize.size - summaryHeight,
                    })
                    .intersect(clipRect),
                clipRect,
            };
        });
    }

    updateFacetTexture() {
        if (!this.#ensureDynamicLocations()) {
            return;
        }

        const sampleData =
            this.#locationContext.getSampleHierarchy().sampleData;

        const sampleCount = sampleData?.ids?.length ?? 0;
        const requiredLength = Math.ceil((sampleCount * 2) / 4) * 4;

        if (
            !this.#facetTextureData ||
            this.#facetTextureData.length !== requiredLength
        ) {
            // Align size to four bytes
            this.#facetTextureData = new Float32Array(requiredLength);
        }

        const height = this.#locationContext.getHeight();
        if (
            this.#facetTextureInputs.baseVersion === this.#baseLayoutVersion &&
            this.#facetTextureInputs.height === height &&
            this.#facetTextureInputs.peekState === this.#peekState &&
            this.#facetTextureInputs.scrollOffset === this.#scrollOffset &&
            this.#facetTextureInputs.sampleCount === sampleCount
        ) {
            return;
        }

        const arr = this.#facetTextureData;
        arr.fill(0);

        const entities = sampleData?.entities;
        if (entities) {
            const sampleLocations = this.#locations.samples;

            for (const sampleLocation of sampleLocations) {
                // TODO: Get rid of the map lookup
                const index = entities[sampleLocation.key].indexNumber;
                arr[index * 2 + 0] = sampleLocation.locSize.location / height;
                arr[index * 2 + 1] = sampleLocation.locSize.size / height;
            }
        }

        const gl = this.#locationContext.viewContext.glHelper.gl;

        this.#facetTexture = createOrUpdateTexture(
            gl,
            {
                internalFormat: gl.RG32F,
                format: gl.RG,
                height: 1,
            },
            arr,
            this.#facetTexture
        );

        this.#facetTextureInputs.baseVersion = this.#baseLayoutVersion;
        this.#facetTextureInputs.height = height;
        this.#facetTextureInputs.peekState = this.#peekState;
        this.#facetTextureInputs.scrollOffset = this.#scrollOffset;
        this.#facetTextureInputs.sampleCount = sampleCount;
    }

    getFacetTexture() {
        return this.#facetTexture;
    }

    /**
     * @param {number} pos
     */
    getSummaryAt(pos) {
        const groups = this.getLocations().summaries;
        const groupIndex = groups.findIndex((summaryLocation) =>
            locSizeEncloses(summaryLocation.locSize, pos)
        );

        return groupIndex >= 0
            ? { index: groupIndex, location: groups[groupIndex] }
            : undefined;
    }

    /**
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} coords
     */
    clipBySummary(coords) {
        if (this.#locationContext.isStickySummaries()) {
            const summaryHeight = this.#locationContext.getSummaryHeight();
            if (summaryHeight > 0) {
                return coords.modify({
                    y: () => coords.y + summaryHeight,
                    height: () => coords.height - summaryHeight,
                });
            }
        }
        return coords;
    }

    #ensureBaseLayout() {
        const height = this.#locationContext.getHeight();
        if (!height) {
            return false;
        }

        const sampleHierarchy = this.#locationContext.getSampleHierarchy();
        const summaryHeight = this.#locationContext.getSummaryHeight();

        if (!this.#structuralDirty) {
            if (
                this.#layoutInputs.height === height &&
                this.#layoutInputs.summaryHeight === summaryHeight &&
                this.#layoutInputs.sampleHierarchy === sampleHierarchy
            ) {
                return true;
            }
        }

        const flattened = getFlattenedGroupHierarchy(sampleHierarchy);

        // Locations squeezed into the viewport height.
        const fittedLocations = calculateLocations(flattened, {
            viewHeight: height,
            groupSpacing: 5, // TODO: Configurable
            summaryHeight,
        });

        // Scrollable locations that are shown when "peek" activates.
        const scrollableLocations = calculateLocations(flattened, {
            sampleHeight: 35, // TODO: Configurable
            groupSpacing: 15, // TODO: Configurable
            summaryHeight,
        });

        this.#baseLocations = {
            fitted: fittedLocations,
            scrollable: scrollableLocations,
        };

        /** Store for scroll offset calculation when peek fires */
        this.#scrollableLocations = scrollableLocations;

        // TODO: Use groups to calculate
        this.#scrollableHeight = scrollableLocations.summaries
            .map((d) => d.locSize.location + d.locSize.size)
            .reduce((a, b) => Math.max(a, b), 0);

        this.setScrollOffset(this.#scrollOffset);

        this.#layoutInputs = {
            height,
            summaryHeight,
            sampleHierarchy,
        };
        this.#structuralDirty = false;
        this.#locations = undefined;
        this.#baseLayoutVersion += 1;

        return true;
    }

    // Builds and updates interpolated locations from the cached base layouts.
    #ensureDynamicLocations() {
        if (!this.#ensureBaseLayout()) {
            return false;
        }

        if (!this.#locations) {
            this.#locations = createInterpolatedLocations(
                this.#baseLocations.fitted
            );
            this.#dynamicInputs.baseVersion = -1;
        }

        const peekState = this.#peekState;
        const scrollOffset = this.#scrollOffset;
        const baseVersion = this.#baseLayoutVersion;

        const baseUpdated = this.#dynamicInputs.baseVersion !== baseVersion;
        const peekChanged = this.#dynamicInputs.peekState !== peekState;
        const scrollChanged = this.#dynamicInputs.scrollOffset !== scrollOffset;

        if (!baseUpdated && !peekChanged && !scrollChanged) {
            return true;
        }

        updateInterpolatedLocations(
            this.#locations,
            this.#baseLocations,
            peekState,
            -scrollOffset
        );
        this.#dynamicInputs.peekState = peekState;
        this.#dynamicInputs.scrollOffset = scrollOffset;
        this.#dynamicInputs.baseVersion = baseVersion;

        // Sample height can change when the base layout or peek state changes.
        if (baseUpdated || peekChanged) {
            this.#callOnLocationUpdate();
        }

        return true;
    }
}

/**
 * Creates mutable locations with fitted positions as a baseline for interpolation.
 *
 * @param {import("./sampleViewTypes.js").Locations} fittedLocations
 * @returns {import("./sampleViewTypes.js").Locations}
 */
function createInterpolatedLocations(fittedLocations) {
    /** @type {import("./sampleViewTypes.js").Locations} */
    const locations = {
        samples: [],
        summaries: [],
        groups: [],
    };

    for (const fittedLocation of fittedLocations.samples) {
        locations.samples.push({
            key: fittedLocation.key,
            locSize: {
                location: fittedLocation.locSize.location,
                size: fittedLocation.locSize.size,
            },
        });
    }

    for (const fittedLocation of fittedLocations.summaries) {
        locations.summaries.push({
            key: fittedLocation.key,
            locSize: {
                location: fittedLocation.locSize.location,
                size: fittedLocation.locSize.size,
            },
        });
    }

    for (const fittedLocation of fittedLocations.groups) {
        locations.groups.push({
            key: fittedLocation.key,
            locSize: {
                location: fittedLocation.locSize.location,
                size: fittedLocation.locSize.size,
            },
        });
    }

    return locations;
}

/**
 * Updates locations in place. Kept stateless for easier testing.
 *
 * @param {import("./sampleViewTypes.js").Locations} target
 * @param {{fitted: import("./sampleViewTypes.js").Locations, scrollable: import("./sampleViewTypes.js").Locations}} base
 * @param {number} ratio
 * @param {number} offset
 */
function updateInterpolatedLocations(target, base, ratio, offset) {
    const { fitted, scrollable } = base;

    interpolateLocations(
        target.samples,
        fitted.samples,
        scrollable.samples,
        ratio,
        offset
    );
    interpolateLocations(
        target.summaries,
        fitted.summaries,
        scrollable.summaries,
        ratio,
        offset
    );
    interpolateLocations(
        target.groups,
        fitted.groups,
        scrollable.groups,
        ratio,
        offset
    );
}

/**
 * Writes interpolated locations into the existing target array to avoid
 * per-frame allocations.
 *
 * @param {import("./sampleViewTypes.js").KeyAndLocation<any>[]} target
 * @param {import("./sampleViewTypes.js").KeyAndLocation<any>[]} fitted
 * @param {import("./sampleViewTypes.js").KeyAndLocation<any>[]} scrollable
 * @param {number} ratio
 * @param {number} offset
 */
function interpolateLocations(target, fitted, scrollable, ratio, offset) {
    if (ratio === 0) {
        for (let i = 0; i < target.length; i++) {
            const targetLoc = target[i].locSize;
            const fromLoc = fitted[i].locSize;
            targetLoc.location = fromLoc.location;
            targetLoc.size = fromLoc.size;
        }
        return;
    }

    if (ratio === 1) {
        for (let i = 0; i < target.length; i++) {
            const targetLoc = target[i].locSize;
            const toLoc = scrollable[i].locSize;
            targetLoc.location = toLoc.location + offset;
            targetLoc.size = toLoc.size;
        }
        return;
    }

    const inverse = 1 - ratio;

    for (let i = 0; i < target.length; i++) {
        const targetLoc = target[i].locSize;
        const fromLoc = fitted[i].locSize;
        const toLoc = scrollable[i].locSize;
        targetLoc.location =
            ratio * (toLoc.location + offset) + inverse * fromLoc.location;
        targetLoc.size = ratio * toLoc.size + inverse * fromLoc.size;
    }
}

/**
 * Calculates locations for samples and groups.
 *
 * @param {Group[][]} flattenedGroupHierarchy Flattened sample groups
 * @param {object} object All measures are in pixels
 * @param {number} [object.viewHeight] Height reserved for all the samples
 * @param {number} [object.sampleHeight] Height of single sample
 * @param {number} [object.groupSpacing] Space between groups
 * @param {number} [object.summaryHeight] Height of group summaries
 *
 */
export function calculateLocations(
    flattenedGroupHierarchy,
    { viewHeight = 0, sampleHeight = 0, groupSpacing = 5, summaryHeight = 0 }
) {
    /**
     * @typedef {import("./state/sampleState.js").Group} Group
     * @typedef {import("./sampleViewTypes.js").GroupLocation} GroupLocation
     * @typedef {import("./sampleViewTypes.js").SampleLocation} SampleLocation
     * @typedef {import("@genome-spy/core/view/layout/flexLayout.js").LocSize} LocSize
     */

    if (!viewHeight && !sampleHeight) {
        throw new Error("viewHeight or sampleHeight must be provided!");
    }

    /** @param {Group[]} path */
    const getSampleGroup = (path) =>
        /** @type {import("./state/sampleSlice.js").SampleGroup} */ (
            peek(path)
        );

    const sampleGroupEntries = flattenedGroupHierarchy
        .map((path) => ({
            path,
            sampleGroup: getSampleGroup(path),
            samples: getSampleGroup(path).samples,
        }))
        // Skip empty groups
        .filter((entry) => entry.samples.length);

    /** @type {function(string[]):import("@genome-spy/core/view/layout/flexLayout.js").SizeDef} */
    const sizeDefGenerator = sampleHeight
        ? (group) => ({
              px: group.length * sampleHeight + summaryHeight,
              grow: 0,
          })
        : (group) => ({ px: summaryHeight, grow: group.length });

    /** @type {GroupLocation[]}} */
    const groupLocations = [];

    mapToPixelCoords(
        sampleGroupEntries.map((entry) => sizeDefGenerator(entry.samples)),
        viewHeight,
        { spacing: groupSpacing }
    ).forEach((location, i) => {
        groupLocations.push({
            key: sampleGroupEntries[i].path,
            locSize: location,
        });
    });

    /** @type {SampleLocation[]} */
    const sampleLocations = [];

    for (const [gi, entry] of sampleGroupEntries.entries()) {
        const sizeDef = { grow: 1 };
        const samples = entry.samples;
        mapToPixelCoords(
            samples.map((d) => sizeDef),
            Math.max(0, groupLocations[gi].locSize.size - summaryHeight),
            {
                offset: groupLocations[gi].locSize.location + summaryHeight,
            }
        ).forEach((locSize, i) => {
            const { size, location } = locSize;

            // TODO: Make padding configurable
            const padding = size * 0.1 * smoothstep(15, 22, size);

            locSize.location = location + padding;
            locSize.size = size - 2 * padding;

            sampleLocations.push({
                key: samples[i],
                locSize: locSize,
            });
        });
    }

    function* extract() {
        /** @type {{group: Group, locSize: LocSize, depth: number, n: number}[]} */
        const stack = [];
        for (const entry of groupLocations) {
            const path = entry.key;
            const last =
                /** @type {import("./state/sampleSlice.js").SampleGroup} */ (
                    peek(path)
                );

            while (
                stack.length <= path.length &&
                stack.length &&
                path[stack.length - 1] != stack[stack.length - 1].group
            ) {
                yield stack.pop();
            }

            for (let i = 0; i < stack.length; i++) {
                const stackItem = stack[i];
                stackItem.locSize.size =
                    entry.locSize.location -
                    stackItem.locSize.location +
                    entry.locSize.size;
            }

            for (let i = stack.length; i < path.length; i++) {
                stack.push({
                    group: path[i],
                    locSize: { ...entry.locSize },
                    depth: stack.length,
                    n: 0,
                });
            }

            for (const group of stack) {
                group.n += last.samples.length;
            }
        }

        while (stack.length) {
            yield stack.pop();
        }
    }

    /** @type {import("./sampleViewTypes.js").HierarchicalGroupLocation[]} */
    const groups = [...extract()]
        .sort((a, b) => a.depth - b.depth)
        .map((entry, index) => ({
            key: {
                index,
                group: entry.group,
                depth: entry.depth,
                n: entry.n,
                attributeLabel: /** @type {string} */ (undefined),
            },
            locSize: entry.locSize,
        }));

    return {
        samples: sampleLocations,
        summaries: groupLocations,
        groups,
    };
}

/**
 *
 * @param {number} pos Coordinate on unit scale
 * @param {import("./sampleViewTypes.js").SampleLocation[]} [sampleLocations]
 */
export function getSampleLocationAt(pos, sampleLocations) {
    // TODO: Matching should be done without paddings
    return sampleLocations.find((sl) => locSizeEncloses(sl.locSize, pos));
}

/**
 * @param {object} metrics
 * @param {number} metrics.viewportHeight
 * @param {number} metrics.scrollableHeight
 * @param {number} metrics.scrollOffset
 * @param {number} metrics.peekState
 * @param {number} [metrics.summaryHeight]
 */
export function computeScrollMetrics({
    viewportHeight,
    scrollableHeight,
    scrollOffset,
    peekState,
    summaryHeight = 0,
}) {
    const effectiveViewportHeight = Math.max(0, viewportHeight - summaryHeight);
    const effectiveScrollableHeight =
        scrollableHeight || effectiveViewportHeight;
    const contentHeight =
        effectiveViewportHeight +
        (effectiveScrollableHeight - effectiveViewportHeight) * peekState;

    return {
        peekState,
        summaryHeight,
        effectiveViewportHeight,
        effectiveScrollableHeight,
        contentHeight,
        effectiveScrollOffset: scrollOffset * peekState,
    };
}

/**
 * @param {LocSize} locSize
 * @param {number} value
 */
export function locSizeEncloses(locSize, value) {
    return value >= locSize.location && value < locSize.location + locSize.size;
}
