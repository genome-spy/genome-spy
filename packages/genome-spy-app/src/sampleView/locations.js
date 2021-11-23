/**
 * @typedef {import("./sampleState").Group} Group
 * @typedef {import("./sampleViewTypes").GroupLocation} GroupLocation
 * @typedef {import("./sampleViewTypes").SampleLocation} SampleLocation
 * @typedef {import("genome-spy/utils/layout/flexLayout").LocSize} LocSize
 */

import { peek } from "genome-spy/utils/arrayUtils";
import {
    locSizeEncloses,
    mapToPixelCoords,
} from "genome-spy/utils/layout/flexLayout";
import smoothstep from "genome-spy/utils/smoothstep";

/**
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
    if (!viewHeight && !sampleHeight) {
        throw new Error("viewHeight or sampleHeight must be provided!");
    }

    /** @param {Group[]} path */
    const getSampleGroup = (path) =>
        /** @type {import("./sampleSlice").SampleGroup} */ (peek(path));

    const sampleGroupEntries = flattenedGroupHierarchy
        .map((path) => ({
            path,
            sampleGroup: getSampleGroup(path),
            samples: getSampleGroup(path).samples,
        }))
        // Skip empty groups
        .filter((entry) => entry.samples.length);

    /** @type {function(string[]):import("genome-spy/utils/layout/flexLayout").SizeDef} */
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
            const last = /** @type {import("./sampleSlice").SampleGroup} */ (
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

    /** @type {import("./sampleViewTypes").HierarchicalGroupLocation[]} */
    const groups = [...extract()]
        .sort((a, b) => a.depth - b.depth)
        .map((entry, index) => ({
            key: {
                index,
                group: entry.group,
                depth: entry.depth,
                n: entry.n,
                attributeLabel: undefined,
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
 * @param {SampleLocation[]} [sampleLocations]
 */
export function getSampleLocationAt(pos, sampleLocations) {
    // TODO: Matching should be done without paddings
    return sampleLocations.find((sl) => locSizeEncloses(sl.locSize, pos));
}
