import { templateResultToString } from "@genome-spy/app/agentShared";
import { ToolCallRejectionError } from "./agentToolErrors.js";

const DEFAULT_MAX_GROUPS = 20;

/**
 * @typedef {import("./agentToolInputs.d.ts").GetSampleGroupsToolInput} GetSampleGroupsToolInput
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 * }} AgentToolExecutionResult
 */

/**
 * @param {{
 *     agentApi: import("@genome-spy/app/agentApi").AgentApi;
 * }} runtime
 * @param {GetSampleGroupsToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function getSampleGroupsTool(runtime, input) {
    const sampleHierarchy = runtime.agentApi.getSampleHierarchy();
    if (!sampleHierarchy || "samples" in sampleHierarchy.rootGroup) {
        throw new ToolCallRejectionError(
            "The current sample hierarchy does not contain visible groups."
        );
    }

    const parentPath = input.parentPath ?? [];
    const level = input.level ?? parentPath.length + 1;
    validateLevel(sampleHierarchy, level);
    validateParentLevel(level, parentPath);
    const parentGroup = findGroupByPath(sampleHierarchy.rootGroup, parentPath);
    if (!parentGroup || "samples" in parentGroup) {
        throw new ToolCallRejectionError(
            "Sample group parent path was not found or has no child groups."
        );
    }

    const matchingGroups = parentPath.length
        ? listChildGroups(parentGroup, parentPath)
        : listGroupsAtLevel(sampleHierarchy.rootGroup, level);
    const limit = input.limit ?? DEFAULT_MAX_GROUPS;
    const returnedGroups = matchingGroups.slice(0, limit);
    const includePath = parentPath.length === 0 && level > 1;

    const content = {
        kind: "sample_group_listing",
        level,
        levelTitle: getLevelTitle(runtime.agentApi, sampleHierarchy, level),
        ...(parentPath.length ? { parentPath } : {}),
        totalGroupCount: matchingGroups.length,
        groupCount: returnedGroups.length,
        groups: returnedGroups.map((entry) =>
            formatGroupEntry(entry, includePath)
        ),
        truncated: matchingGroups.length > returnedGroups.length,
        guide: createInterpretationGuide(parentPath.length > 0),
    };

    return {
        text: `Listed ${returnedGroups.length} sample groups at level ${level}.`,
        content,
    };
}

/**
 * @param {boolean} parentScoped
 */
function createInterpretationGuide(parentScoped) {
    return {
        levels: "Grouping levels are one-based. Level 1 is the first visible grouping under ROOT.",
        groups: parentScoped
            ? "Each entry is a direct child of parentPath. Combine parentPath and name for the full group path."
            : "Each entry is a group at the requested level. Nested levels use full path because names may repeat under different parents.",
        order: "Groups are returned in current display order.",
    };
}

/**
 * @param {import("@genome-spy/app/agentShared").SampleHierarchy} sampleHierarchy
 * @param {number} level
 */
function validateLevel(sampleHierarchy, level) {
    if (!Number.isInteger(level) || level < 1) {
        throw new ToolCallRejectionError(
            "Grouping level must be a positive integer."
        );
    }

    if (level > sampleHierarchy.groupMetadata.length) {
        throw new ToolCallRejectionError("Grouping level not found: " + level);
    }
}

/**
 * @param {number} level
 * @param {string[]} parentPath
 */
function validateParentLevel(level, parentPath) {
    if (parentPath.length && level !== parentPath.length + 1) {
        throw new ToolCallRejectionError(
            "`level` must identify the direct children of `parentPath`."
        );
    }
}

/**
 * @param {import("@genome-spy/app/agentShared").Group} rootGroup
 * @param {string[]} path
 * @returns {import("@genome-spy/app/agentShared").Group | undefined}
 */
function findGroupByPath(rootGroup, path) {
    let group = rootGroup;
    for (const name of path) {
        if ("samples" in group) {
            return undefined;
        }

        group = group.groups.find((child) => child.name === name);
        if (!group) {
            return undefined;
        }
    }

    return group;
}

/**
 * @param {import("@genome-spy/app/agentShared").GroupGroup} parentGroup
 * @param {string[]} parentPath
 */
function listChildGroups(parentGroup, parentPath) {
    return parentGroup.groups.map((group) => ({
        group,
        path: [...parentPath, group.name],
    }));
}

/**
 * @param {import("@genome-spy/app/agentShared").GroupGroup} rootGroup
 * @param {number} level
 */
function listGroupsAtLevel(rootGroup, level) {
    /** @type {{ group: import("@genome-spy/app/agentShared").Group; path: string[] }[]} */
    const groups = [];

    /**
     * @param {import("@genome-spy/app/agentShared").Group} group
     * @param {string[]} path
     * @param {number} currentLevel
     */
    const visit = (group, path, currentLevel) => {
        if (currentLevel === level) {
            groups.push({ group, path });
        } else if ("groups" in group) {
            for (const child of group.groups) {
                visit(child, [...path, child.name], currentLevel + 1);
            }
        }
    };

    for (const child of rootGroup.groups) {
        visit(child, [child.name], 1);
    }

    return groups;
}

/**
 * @param {{ group: import("@genome-spy/app/agentShared").Group; path: string[] }} entry
 * @param {boolean} includePath
 */
function formatGroupEntry(entry, includePath) {
    const { group, path } = entry;
    /** @type {{ path?: string[]; name?: string; title?: string; sampleCount?: number; childGroupCount?: number }} */
    const result = includePath ? { path } : { name: group.name };
    if (group.title !== group.name) {
        result.title = group.title;
    }
    result.sampleCount = countSamples(group);
    if ("groups" in group && group.groups.length) {
        result.childGroupCount = group.groups.length;
    }
    return result;
}

/**
 * @param {import("@genome-spy/app/agentShared").Group} group
 * @returns {number}
 */
function countSamples(group) {
    if ("samples" in group) {
        return group.samples.length;
    }

    return group.groups.reduce((sum, child) => sum + countSamples(child), 0);
}

/**
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {import("@genome-spy/app/agentShared").SampleHierarchy} sampleHierarchy
 * @param {number} level
 */
function getLevelTitle(agentApi, sampleHierarchy, level) {
    const entry = sampleHierarchy.groupMetadata[level - 1];
    const info = agentApi.getAttributeInfo(entry.attribute);
    return templateResultToString(info.title);
}
