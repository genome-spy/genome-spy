import ContainerView from "../view/containerView.js";

/**
 * @typedef {object} ResolutionDebugSnapshotOptions
 * @prop {(object: object) => string} getDebugId
 */

/**
 * @typedef {object} ResolutionDebugSnapshot
 * @prop {ScaleResolutionDebugNode[]} scales
 * @prop {AxisResolutionDebugNode[]} axes
 * @prop {LegendResolutionDebugNode[]} legends
 */

/**
 * @typedef {object} ScaleResolutionDebugNode
 * @prop {string} id
 * @prop {string} channel
 * @prop {string | undefined} name
 * @prop {string | null | undefined} type
 * @prop {string | undefined} resolvedScaleType
 * @prop {any[] | undefined} domain
 * @prop {any[] | undefined} complexDomain
 * @prop {any[] | undefined} range
 * @prop {boolean} zoomable
 * @prop {boolean} zoomed
 * @prop {number} activeMemberCount
 * @prop {number} dataDomainMemberCount
 * @prop {ScaleResolutionMemberDebugNode[]} members
 */

/**
 * @typedef {object} ScaleResolutionMemberDebugNode
 * @prop {string} viewId
 * @prop {string} viewPath
 * @prop {string} channel
 * @prop {string | undefined} field
 * @prop {string | undefined} expr
 * @prop {string | undefined} type
 * @prop {boolean} contributesToDomain
 * @prop {boolean} active
 */

/**
 * @typedef {object} AxisResolutionDebugNode
 * @prop {string} id
 * @prop {string} channel
 * @prop {string | null | undefined} title
 * @prop {string | undefined} scaleResolutionId
 * @prop {boolean} hasVisibleNonChromeMember
 * @prop {AxisResolutionMemberDebugNode[]} members
 */

/**
 * @typedef {object} AxisResolutionMemberDebugNode
 * @prop {string} viewId
 * @prop {string} viewPath
 * @prop {string} channel
 * @prop {string | undefined} field
 * @prop {string | undefined} expr
 * @prop {string | undefined} type
 */

/**
 * @typedef {object} LegendResolutionDebugNode
 * @prop {string} id
 * @prop {string} channel
 * @prop {boolean} hasVisibleNonChromeMember
 * @prop {number} definitionCount
 * @prop {LegendResolutionMemberDebugNode[]} members
 */

/**
 * @typedef {object} LegendResolutionMemberDebugNode
 * @prop {string} viewId
 * @prop {string} viewPath
 * @prop {string} channel
 */

/**
 * @param {import("../view/view.js").default | undefined} root
 * @param {ResolutionDebugSnapshotOptions} options
 * @returns {ResolutionDebugSnapshot}
 */
export function createResolutionDebugSnapshot(root, options) {
    if (!root) {
        return {
            scales: [],
            axes: [],
            legends: [],
        };
    }

    const scaleResolutions = new Set();
    const axisResolutions = new Set();
    const legendResolutions = new Set();

    visitViews(root, (view) => {
        addDefinedValues(scaleResolutions, view.resolutions.scale);
        addDefinedValues(axisResolutions, view.resolutions.axis);
        addDefinedValues(legendResolutions, view.resolutions.legend);
    });

    return {
        scales: Array.from(scaleResolutions).map((resolution) =>
            createScaleDebugNode(resolution, options)
        ),
        axes: Array.from(axisResolutions).map((resolution) =>
            createAxisDebugNode(resolution, options)
        ),
        legends: Array.from(legendResolutions).map((resolution) =>
            createLegendDebugNode(resolution, options)
        ),
    };
}

/**
 * @param {Set<any>} set
 * @param {Record<string, any>} values
 */
function addDefinedValues(set, values) {
    for (const value of Object.values(values)) {
        if (value) {
            set.add(value);
        }
    }
}

/**
 * @param {import("../view/view.js").default} root
 * @param {(view: import("../view/view.js").default) => void} visitor
 */
function visitViews(root, visitor) {
    visitor(root);
    if (root instanceof ContainerView) {
        for (const child of root) {
            visitViews(child, visitor);
        }
    }
}

/**
 * @param {any} resolution
 * @param {ResolutionDebugSnapshotOptions} options
 * @returns {ScaleResolutionDebugNode}
 */
function createScaleDebugNode(resolution, options) {
    const state = resolution.getDebugState();
    return {
        id: options.getDebugId(resolution),
        channel: state.channel,
        name: state.name,
        type: state.type,
        resolvedScaleType: state.resolvedScaleType,
        domain: state.domain,
        complexDomain: state.complexDomain,
        range: state.range,
        zoomable: state.zoomable,
        zoomed: state.zoomed,
        activeMemberCount: state.activeMemberCount,
        dataDomainMemberCount: state.dataDomainMemberCount,
        members: state.members.map(
            /**
             * @param {any} member
             * @returns {ScaleResolutionMemberDebugNode}
             */
            (member) => ({
                viewId: options.getDebugId(member.view),
                viewPath: member.view.getPathString(),
                channel: member.channel,
                field:
                    "field" in member.channelDef
                        ? member.channelDef.field
                        : undefined,
                expr:
                    "expr" in member.channelDef
                        ? member.channelDef.expr
                        : undefined,
                type:
                    "type" in member.channelDef
                        ? member.channelDef.type
                        : undefined,
                contributesToDomain: member.contributesToDomain,
                active: member.active,
            })
        ),
    };
}

/**
 * @param {any} resolution
 * @param {ResolutionDebugSnapshotOptions} options
 * @returns {AxisResolutionDebugNode}
 */
function createAxisDebugNode(resolution, options) {
    const state = resolution.getDebugState();
    return {
        id: options.getDebugId(resolution),
        channel: state.channel,
        title: state.title,
        scaleResolutionId: state.scaleResolution
            ? options.getDebugId(state.scaleResolution)
            : undefined,
        hasVisibleNonChromeMember: state.hasVisibleNonChromeMember,
        members: state.members.map(
            /**
             * @param {any} member
             * @returns {AxisResolutionMemberDebugNode}
             */
            (member) => ({
                viewId: options.getDebugId(member.view),
                viewPath: member.view.getPathString(),
                channel: member.channel,
                field:
                    "field" in member.channelDef
                        ? member.channelDef.field
                        : undefined,
                expr:
                    "expr" in member.channelDef
                        ? member.channelDef.expr
                        : undefined,
                type:
                    "type" in member.channelDef
                        ? member.channelDef.type
                        : undefined,
            })
        ),
    };
}

/**
 * @param {any} resolution
 * @param {ResolutionDebugSnapshotOptions} options
 * @returns {LegendResolutionDebugNode}
 */
function createLegendDebugNode(resolution, options) {
    const state = resolution.getDebugState();
    return {
        id: options.getDebugId(resolution),
        channel: state.channel,
        hasVisibleNonChromeMember: state.hasVisibleNonChromeMember,
        definitionCount: state.legendDefs.length,
        members: state.members.map(
            /**
             * @param {any} member
             * @returns {LegendResolutionMemberDebugNode}
             */
            (member) => ({
                viewId: options.getDebugId(member.view),
                viewPath: member.view.getPathString(),
                channel: member.channel,
            })
        ),
    };
}
