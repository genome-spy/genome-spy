import { onTestFinished } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "./viewMutationApi.js";

/**
 * Creates the real headless engine and public view API with test-owned disposal.
 * @param {Parameters<typeof createHeadlessEngine>[0]} spec
 * @param {Parameters<typeof createHeadlessEngine>[1]} [options]
 */
export async function createTestEmbed(spec, options) {
    const { view: root, context } = await createHeadlessEngine(spec, options);
    let active = true;
    const views = createViewMutationApi({ viewRoot: root }, () => active);
    const finalize = () => {
        if (active) {
            active = false;
            root.disposeSubtree();
        }
    };
    onTestFinished(finalize);
    return { root, context, views, finalize };
}

/**
 * @param {import("../types/embedApi.js").ViewHandle} handle
 * @param {string} [name]
 */
export function getPointSelection(handle, name = "selected") {
    const selection = handle.params.getSelection(name);
    if (selection.type !== "point" || selection.membership !== "records")
        throw new Error("Expected point selection.");
    return selection;
}
