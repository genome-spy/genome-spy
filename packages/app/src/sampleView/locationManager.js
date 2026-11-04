import PlacementSource from "@genome-spy/core/view/layout/placementSource.js";
import {
    countPerformance,
    measurePerformance,
} from "@genome-spy/core/debug/performanceProfiler.js";
import clamp from "@genome-spy/core/utils/clamp.js";
import Padding from "@genome-spy/core/view/layout/padding.js";
import smoothstep from "@genome-spy/core/utils/smoothstep.js";
import transition, {
    createCancelToken,
} from "@genome-spy/core/utils/transition.js";
import { easeCubicOut, easeExpOut } from "d3-ease";
import { getFlattenedGroupHierarchy } from "./state/sampleSlice.js";

/** @typedef {import("@genome-spy/core/view/layout/flexLayout.js").LocSize} LocSize */
/** @typedef {{step: number, inset: number, gap: number, origin: number, summary: number}} RowGeometry */
/** @typedef {{start: number, end: number, firstLeaf: number, lastLeaf: number, locSize: LocSize}} SampleInterval */

const DEFAULT_SAMPLE_HEIGHT = 35;
const DEFAULT_GROUP_SPACING = 5;
const DEFAULT_PEEK_GROUP_SPACING = 15;
const DEFAULT_SAMPLE_SPACING_FACTOR = 0.2;

/** @type {readonly string[]} */
const EMPTY_SAMPLE_IDS = [];

export class LocationManager {
    /**
     * 0: Bird's eye view, 1: Closeup view, (0, 1): Transitioning between the two
     */
    #peekState = 0;

    #peekCancelToken = createCancelToken();

    /** @type {((timestamp: number) => void) | undefined} */
    #peekFrame;

    #scrollOffset = 0;

    #scrollableHeight = 0;

    /** @type {PlacementSource} */
    #placementSource = new PlacementSource();

    /** @type {Map<string, number>} */
    #placementIndices = new Map();

    /** @type {readonly string[]} */
    #placementSampleIds = EMPTY_SAMPLE_IDS;

    /** @type {WeakMap<object, number>} */
    #placementLocationIndices = new WeakMap();

    #placementLocationVersion = -1;

    /** @type {Float32Array} */
    #placementRectangles = new Float32Array();

    /** @type {import("./sampleViewTypes.js").Locations} */
    #locations = undefined;

    /** @type {ReturnType<typeof createSampleTopology>} */
    #topology;

    #fittedStep = 0;

    #closeupStep = 0;

    #rowGeometry = { step: 0, inset: 0, gap: 0, origin: 0, summary: 0 };

    #geometryRevision = 0;

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

    // Cache of the inputs that affect placement geometry updates.
    #placementInputs = {
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

    dispose() {
        this.#peekCancelToken.canceled = true;
        if (this.#peekFrame) {
            this.#locationContext.viewContext.animator.cancelTransition(
                this.#peekFrame
            );
            // Settle the canceled transition without waiting for another frame.
            this.#peekFrame(performance.now());
        }
        this.#placementSource.dispose();
    }

    isCloseup() {
        return this.#peekState === 1;
    }

    resetLocations() {
        // Layout inputs changed; force a structural rebuild on the next access.
        this.#structuralDirty = true;
        this.#locations = undefined;
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

    /** Padded fitted row height, independent of peek animation and scrolling. */
    getOverviewSampleHeight() {
        if (!this.#ensureBaseLayout()) return 0;
        const factor =
            this.#locationContext.sampleLayout?.sampleSpacingFactor ??
            DEFAULT_SAMPLE_SPACING_FACTOR;
        return (
            this.#fittedStep - 2 * getSampleRowInset(this.#fittedStep, factor)
        );
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
        this.#ensureDynamicLocations();
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

    /** @param {number} delta */
    canScroll(delta) {
        return (
            (delta < 0 && this.#scrollOffset > 0) ||
            (delta > 0 &&
                this.#scrollOffset <
                    this.#scrollableHeight - this.#locationContext.getHeight())
        );
    }

    /**
     * @param {boolean} [open] open if true, close if false, toggle if undefined
     * @param {number} [mouseY] Mouse position in pixels
     * @param {string} [sampleId]
     * @returns {Promise<void>}
     */
    togglePeek(open, mouseY, sampleId) {
        if (this.#peekCancelToken.canceled) {
            return Promise.resolve();
        }

        if (this.#peekState > 0 && this.#peekState < 1) {
            // Transition is going on
            return Promise.resolve();
        }

        if (open !== undefined && open == !!this.#peekState) {
            return Promise.resolve();
        }

        if (!this.getLocations()) {
            return Promise.resolve();
        }

        const viewContext = this.#locationContext.viewContext;
        const height = this.#locationContext.getHeight();

        /** @type {import("@genome-spy/core/utils/transition.js").TransitionOptions} */
        const props = {
            requestAnimationFrame: (callback) => {
                this.#peekFrame = (timestamp) => {
                    this.#peekFrame = undefined;
                    callback(timestamp);
                };
                viewContext.animator.requestTransition(this.#peekFrame);
            },
            cancelToken: this.#peekCancelToken,
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
                const index = this.#topology.sampleIds.indexOf(sampleId);
                const leaf = this.#topology.sampleLeaves[index];
                target =
                    this.#layoutInputs.summaryHeight +
                    (index + 0.5) * this.#closeupStep +
                    leaf *
                        (this.#layoutInputs.summaryHeight +
                            (this.#locationContext.sampleLayout
                                ?.peekGroupSpacing ??
                                DEFAULT_PEEK_GROUP_SPACING));
            } else {
                // Match sample summaries
                const groupInfo = this.getSummaryAt(mouseY);
                if (groupInfo) {
                    // TODO: Simplify now that target is available in groupLocations
                    const interval = this.#topology.leaves[groupInfo.index];
                    target =
                        interval.start * this.#closeupStep +
                        groupInfo.index *
                            (this.#layoutInputs.summaryHeight +
                                (this.#locationContext.sampleLayout
                                    ?.peekGroupSpacing ??
                                    DEFAULT_PEEK_GROUP_SPACING)) -
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
                return transition({
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

                return transition({
                    ...props,
                    from: 0,
                    to: 1,
                    duration: 300,
                    easingFunction: bounce,
                });
            }
        } else {
            return transition({
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
        const locations = this.getLocations();
        if (!locations) {
            return [];
        }

        const groups = locations.groups;
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

    #updatePlacementGeometry() {
        const sampleData =
            this.#locationContext.getSampleHierarchy().sampleData;
        const sampleIds = sampleData?.ids ?? EMPTY_SAMPLE_IDS;

        const sampleCount = sampleIds.length;
        const requiredLength = sampleCount * 4;
        // Sample state is immutable: a new ids array is the topology revision
        // signal. Do not compare every member during geometry-only updates.
        const membershipChanged = this.#placementSampleIds !== sampleIds;

        if (
            this.#placementRectangles.length !== requiredLength ||
            membershipChanged
        ) {
            this.#placementRectangles = new Float32Array(requiredLength);
            this.#placementIndices = new Map(
                sampleIds.map((id, index) => [id, index])
            );
            this.#placementSource.replaceTopology(
                sampleIds.map((id) => [id]),
                this.#placementRectangles
            );
            this.#placementSampleIds = sampleIds;
        }

        const height = this.#locationContext.getHeight();
        const hasLocations = this.#ensureDynamicLocations();
        if (
            hasLocations &&
            (this.#placementLocationVersion !== this.#baseLayoutVersion ||
                membershipChanged)
        ) {
            for (const sampleLocation of this.#locations.samples) {
                const index = this.#placementIndices.get(sampleLocation.key);
                if (index !== undefined) {
                    this.#placementLocationIndices.set(sampleLocation, index);
                }
            }
            this.#placementLocationVersion = this.#baseLayoutVersion;
        }
        if (
            !membershipChanged &&
            this.#placementInputs.baseVersion === this.#baseLayoutVersion &&
            this.#placementInputs.height === height &&
            this.#placementInputs.peekState === this.#peekState &&
            this.#placementInputs.scrollOffset === this.#scrollOffset &&
            this.#placementInputs.sampleCount === sampleCount
        ) {
            return;
        }

        measurePerformance("placementComputation", () => {
            const arr = this.#placementRectangles;
            countPerformance("placementComputationSamples", sampleCount);
            countPerformance("placementComputationBytes", arr.byteLength);
            arr.fill(0);
            for (let index = 0; index < sampleCount; index++) {
                arr[index * 4 + 2] = 1;
            }

            // Picking can observe a transient zero-sized view while closeup is
            // being activated. Keep the complete topology but publish empty
            // geometry until normalization has a valid owner height.
            if (hasLocations && Number.isFinite(height) && height > 0) {
                const sampleLocations = this.#locations.samples;

                for (const sampleLocation of sampleLocations) {
                    const index =
                        this.#placementLocationIndices.get(sampleLocation);
                    if (index === undefined) {
                        continue;
                    }
                    arr[index * 4] = 0;
                    arr[index * 4 + 1] =
                        sampleLocation.locSize.location / height;
                    arr[index * 4 + 2] = 1;
                    arr[index * 4 + 3] = sampleLocation.locSize.size / height;
                }
            }

            this.#placementSource.replaceGeometry(arr);
        });

        this.#placementInputs.baseVersion = this.#baseLayoutVersion;
        this.#placementInputs.height = height;
        this.#placementInputs.peekState = this.#peekState;
        this.#placementInputs.scrollOffset = this.#scrollOffset;
        this.#placementInputs.sampleCount = sampleCount;
    }

    getPlacementSource() {
        this.#updatePlacementGeometry();
        return this.#placementSource;
    }

    /** @param {string} sampleId @returns {number | undefined} */
    getPlacementIndex(sampleId) {
        this.#updatePlacementGeometry();
        return this.#placementIndices.get(sampleId);
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

    /** Requested row camera for Core's viewport and repeated plot placement. */
    getBandLayout() {
        if (!this.#ensureDynamicLocations()) return undefined;
        const { step, inset, gap, origin, summary } = this.#rowGeometry;
        return {
            sampleIds: this.#topology.sampleIds,
            cuts: this.#topology.cuts,
            gap,
            inset,
            step,
            summaryHeight: summary,
            origin,
            revision: this.#geometryRevision,
        };
    }

    /** @param {import("./state/sampleState.js").Group} group */
    getGroupSampleBounds(group) {
        this.#ensureDynamicLocations();
        const interval = this.#topology.groupBounds.get(group);
        return {
            startRank: interval.start,
            endRank: interval.end,
            firstLeaf: interval.firstLeaf,
            lastLeaf: interval.lastLeaf,
        };
    }

    /** Half-open display-rank interval, retaining exact viewport-edge contact. */
    getVisibleSampleRange() {
        if (!this.#ensureDynamicLocations() || this.#rowGeometry.step === 0)
            return [0, 0];
        const samples = this.#locations.samples;
        let lo = 0;
        let hi = samples.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            const row = samples[mid].locSize;
            if (row.location + row.size < 0) lo = mid + 1;
            else hi = mid;
        }
        const first = lo;
        hi = samples.length;
        const height = this.#layoutInputs.height;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (samples[mid].locSize.location <= height) lo = mid + 1;
            else hi = mid;
        }
        return [first, lo];
    }

    #ensureBaseLayout() {
        const height = this.#locationContext.getHeight();
        if (!(height > 0)) return false;

        const sampleHierarchy = this.#locationContext.getSampleHierarchy();
        const summaryHeight = this.#locationContext.getSummaryHeight();
        if (
            !this.#structuralDirty &&
            this.#layoutInputs.height === height &&
            this.#layoutInputs.summaryHeight === summaryHeight &&
            this.#layoutInputs.sampleHierarchy === sampleHierarchy
        )
            return true;

        if (
            this.#structuralDirty ||
            this.#layoutInputs.sampleHierarchy?.rootGroup !==
                sampleHierarchy.rootGroup
        ) {
            this.#topology = createSampleTopology(
                getFlattenedGroupHierarchy(sampleHierarchy),
                this.#rowGeometry
            );
        }
        this.#locations = this.#topology.locations;

        const layout = this.#locationContext.sampleLayout ?? {};
        const count = this.#topology.sampleIds.length;
        const leaves = this.#topology.leaves.length;
        const spacing = layout.groupSpacing ?? DEFAULT_GROUP_SPACING;
        const peekSpacing =
            layout.peekGroupSpacing ?? DEFAULT_PEEK_GROUP_SPACING;
        this.#fittedStep = count
            ? Math.max(
                  0,
                  height -
                      leaves * summaryHeight -
                      Math.max(0, leaves - 1) * spacing
              ) / count
            : 0;
        this.#closeupStep = layout.sampleHeight ?? DEFAULT_SAMPLE_HEIGHT;
        this.#scrollableHeight =
            count * this.#closeupStep +
            leaves * summaryHeight +
            Math.max(0, leaves - 1) * peekSpacing;
        this.#scrollOffset = clamp(
            this.#scrollOffset,
            0,
            Math.max(0, this.#scrollableHeight - height)
        );

        this.#layoutInputs = { height, summaryHeight, sampleHierarchy };
        this.#structuralDirty = false;
        this.#baseLayoutVersion += 1;
        return true;
    }

    #ensureDynamicLocations() {
        if (!this.#ensureBaseLayout()) return false;
        const ratio = this.#peekState;
        const baseUpdated =
            this.#dynamicInputs.baseVersion !== this.#baseLayoutVersion;
        if (
            !baseUpdated &&
            this.#dynamicInputs.peekState === ratio &&
            this.#dynamicInputs.scrollOffset === this.#scrollOffset
        )
            return true;

        const layout = this.#locationContext.sampleLayout ?? {};
        const summary = this.#layoutInputs.summaryHeight;
        const factor =
            layout.sampleSpacingFactor ?? DEFAULT_SAMPLE_SPACING_FACTOR;
        const geometry = this.#rowGeometry;
        geometry.step =
            this.#fittedStep * (1 - ratio) + this.#closeupStep * ratio;
        geometry.inset =
            getSampleRowInset(this.#fittedStep, factor) * (1 - ratio) +
            getSampleRowInset(this.#closeupStep, factor) * ratio;
        geometry.gap =
            summary +
            (layout.groupSpacing ?? DEFAULT_GROUP_SPACING) * (1 - ratio) +
            (layout.peekGroupSpacing ?? DEFAULT_PEEK_GROUP_SPACING) * ratio;
        geometry.origin = summary - ratio * this.#scrollOffset;
        geometry.summary = summary;

        this.#dynamicInputs = {
            peekState: ratio,
            scrollOffset: this.#scrollOffset,
            baseVersion: this.#baseLayoutVersion,
        };
        this.#geometryRevision += 1;
        this.#locationContext.onLocationUpdate({
            sampleHeight: geometry.step - 2 * geometry.inset,
        });
        return true;
    }
}

/** @param {number} step @param {number} spacingFactor */
function getSampleRowInset(step, spacingFactor) {
    return step * spacingFactor * 0.5 * smoothstep(15, 22, step);
}

/**
 * Build identity and group intervals once; all frame geometry is derived from
 * these display ranks, never from two independently cached layouts.
 * @param {import("./state/sampleState.js").Group[][]} paths
 * @param {RowGeometry} geometry
 */
function createSampleTopology(paths, geometry) {
    /** @type {import("./sampleViewTypes.js").Locations} */
    const locations = { samples: [], summaries: [], groups: [] };
    /** @type {string[]} */
    const sampleIds = [];
    /** @type {number[]} */
    const sampleLeaves = [];
    /** @type {string[]} */
    const cuts = [];
    /** @type {SampleInterval[]} */
    const leaves = [];
    /** @type {Map<import("./state/sampleState.js").Group, SampleInterval & { group: import("./state/sampleState.js").Group, depth: number }>} */
    const groups = new Map();
    for (const path of paths) {
        const samples =
            /** @type {import("./state/sampleState.js").SampleGroup} */ (
                path.at(-1)
            ).samples;
        if (!samples.length) continue;
        const firstLeaf = leaves.length;
        const start = sampleIds.length;
        const end = start + samples.length;
        if (firstLeaf) cuts.push(samples[0]);
        const leaf = createSampleInterval(start, end, firstLeaf, geometry);
        leaves.push(leaf);
        locations.summaries.push({ key: path, locSize: leaf.locSize });
        for (const id of samples) {
            const rank = sampleIds.length;
            sampleIds.push(id);
            sampleLeaves.push(firstLeaf);
            locations.samples.push({
                key: id,
                // Retained rectangles read this completed scalar frame directly.
                locSize: {
                    get location() {
                        return (
                            geometry.origin +
                            rank * geometry.step +
                            firstLeaf * geometry.gap +
                            geometry.inset
                        );
                    },
                    get size() {
                        return geometry.step - 2 * geometry.inset;
                    },
                },
            });
        }
        path.forEach((group, depth) => {
            let interval = groups.get(group);
            if (!interval) {
                interval = Object.assign(
                    createSampleInterval(start, end, firstLeaf, geometry),
                    { group, depth }
                );
                groups.set(group, interval);
            }
            interval.end = end;
            interval.lastLeaf = firstLeaf;
        });
    }
    Array.from(groups.values())
        .sort((a, b) => a.depth - b.depth)
        .forEach((interval, index) => {
            locations.groups.push({
                key: {
                    index,
                    group: interval.group,
                    depth: interval.depth,
                    n: interval.end - interval.start,
                },
                locSize: interval.locSize,
            });
        });
    return {
        locations,
        sampleIds,
        sampleLeaves,
        cuts,
        leaves,
        groupBounds: groups,
    };
}

/**
 * @param {number} start
 * @param {number} end
 * @param {number} firstLeaf
 * @param {RowGeometry} geometry
 * @returns {SampleInterval}
 */
function createSampleInterval(start, end, firstLeaf, geometry) {
    /** @type {SampleInterval} */
    const interval = {
        start,
        end,
        firstLeaf,
        lastLeaf: firstLeaf,
        locSize: {
            get location() {
                return (
                    geometry.origin +
                    interval.start * geometry.step +
                    interval.firstLeaf * geometry.gap -
                    geometry.summary
                );
            },
            get size() {
                return (
                    (interval.end - interval.start) * geometry.step +
                    (interval.lastLeaf - interval.firstLeaf) * geometry.gap +
                    geometry.summary
                );
            },
        },
    };
    return interval;
}

/**
 *
 * @param {number} pos Coordinate on unit scale
 * @param {import("./sampleViewTypes.js").SampleLocation[]} [sampleLocations]
 */
export function getSampleLocationAt(pos, sampleLocations) {
    const index = sampleRankAt(pos, sampleLocations);
    const sample = sampleLocations[index];
    return sample && locSizeEncloses(sample.locSize, pos) ? sample : undefined;
}

/**
 * Returns the closest sample location to the given vertical position.
 *
 * This is useful when the pointer falls into padding between fitted sample
 * rows but the nearest sample should still be considered the interaction focus.
 *
 * @param {number} pos Coordinate on unit scale
 * @param {import("./sampleViewTypes.js").SampleLocation[]} [sampleLocations]
 * @param {number} [epsilon] Prefer the upper row for distances within this tolerance.
 */
export function getClosestSampleLocationAt(pos, sampleLocations, epsilon = 0) {
    if (!sampleLocations?.length || !Number.isFinite(pos)) {
        return undefined;
    }

    const rank = sampleRankAt(pos - epsilon, sampleLocations);
    const upper = sampleLocations[Math.max(0, rank)];
    const lower =
        sampleLocations[Math.min(sampleLocations.length - 1, rank + 1)];
    const closest =
        distanceToLocSize(pos, upper.locSize) <=
        distanceToLocSize(pos, lower.locSize) + epsilon
            ? upper
            : lower;
    // Exhausted fits can place several zero-height rows at the same coordinate.
    return closest.locSize.size === 0
        ? sampleLocations[
              sampleRankAt(closest.locSize.location, sampleLocations, true) + 1
          ]
        : closest;
}

/** Invert monotonically ordered row starts without scanning or allocating.
 * @param {number} pos
 * @param {import("./sampleViewTypes.js").SampleLocation[]} samples
 * @param {boolean} [before] Stop before equal row starts.
 */
function sampleRankAt(pos, samples, before = false) {
    let lo = 0;
    let hi = samples.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const start = samples[mid].locSize.location;
        if (start < pos || (!before && start === pos)) lo = mid + 1;
        else hi = mid;
    }
    return lo - 1;
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

/**
 * @param {number} value
 * @param {LocSize} locSize
 */
function distanceToLocSize(value, locSize) {
    if (locSizeEncloses(locSize, value)) {
        return 0;
    } else if (value < locSize.location) {
        return locSize.location - value;
    } else {
        return value - (locSize.location + locSize.size);
    }
}
