import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import UnitView from "../view/unitView.js";

/**
 * @param {import("../spec/view.js").ViewSpec} spec
 * @param {{ new(...args: any[]): import("../view/view.js").default }} [viewType]
 * @returns {Promise<import("../view/view.js").default>}
 */
export async function initView(spec, viewType = UnitView) {
    const { view } = await createHeadlessEngine(spec);
    if (!(view instanceof viewType)) {
        throw new Error("ViewClass and the spec do not match!");
    }
    return view;
}

/**
 * @param {import("../view/view.js").default} view
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @returns {import("./scaleResolution.js").default}
 */
export function getRequiredScaleResolution(view, channel) {
    const resolution = view.getScaleResolution(channel);
    if (!resolution) {
        throw new Error(`Expected ${channel} scale resolution.`);
    }
    return resolution;
}

/**
 * @param {import("../view/view.js").default} view
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @returns {any[]}
 */
export function getScaleDomain(view, channel) {
    return getRequiredScaleResolution(view, channel).scale.domain();
}
