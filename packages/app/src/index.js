import { isObject, isString } from "vega-util";

import GenomeSpy from "@genome-spy/core/genomeSpy.js";
import { loadSpec } from "@genome-spy/core/index.js";
import { createEmbedResult } from "@genome-spy/core/embedApi.js";
import { createEmbedErrorHandler } from "@genome-spy/core/embedError.js";
import App from "./app.js";
import icon from "@genome-spy/core/img/bowtie.svg";
import { html } from "lit";
export { createAgentApi, embedRenderablePlot } from "./agentApi/index.js";

export { GenomeSpy, App as GenomeSpyApp, icon, html };
export * from "./agentShared/index.js";
export { BaseDialog, showDialog, showMessageDialog } from "./dialog/index.js";

/**
 * Embeds GenomeSpy App into the DOM.
 *
 * @type {import("./embedTypes.js").AppEmbedFunction}
 */
export async function embed(el, spec, options = {}) {
    let active = true;
    const isActive = () => active;

    /** @type {HTMLElement} */
    let element;

    if (isString(el)) {
        element = document.querySelector(el);
        if (!element) {
            throw new Error(`No such element: ${el}`);
        }
    } else if (el instanceof HTMLElement) {
        element = el;
    } else {
        throw new Error(`Invalid element: ${el}`);
    }

    /** @type {import("@genome-spy/core/genomeSpy.js").default} */
    let genomeSpy;
    /** @type {App | undefined} */
    let app;
    /** @type {(() => void)[]} */
    let pluginDisposers = [];
    const errorHandler = createEmbedErrorHandler(element, options);

    try {
        const specObject = isObject(spec) ? spec : await loadSpec(spec);

        specObject.baseUrl ??= "";
        specObject.padding ??= 10;

        const embedOptions =
            /** @type {import("./embedTypes.js").AppEmbedOptions} */ ({
                powerPreference: "high-performance",
                ...options,
                onError: errorHandler.onError,
            });

        const { plugins = [], ...appEmbedOptions } =
            /** @type {import("./embedTypes.js").AppEmbedOptions} */ (
                embedOptions
            );

        app = new App(element, specObject, appEmbedOptions);
        genomeSpy = app.genomeSpy;
        for (const plugin of plugins) {
            const disposer = await plugin.install(app);
            if (typeof disposer === "function") {
                pluginDisposers.push(disposer);
            }
        }
        applyOptions(genomeSpy, appEmbedOptions);
        errorHandler.complete(await app.launch());
    } catch (error) {
        errorHandler.fail(error, element, [
            ...pluginDisposers.toReversed(),
            () => app?.finalize(),
            () => genomeSpy?.destroy(),
            () => element.replaceChildren(),
        ]);
    }

    return createEmbedResult({
        genomeSpy,
        isActive,
        debug: app.debug,
        finalize() {
            active = false;
            const disposers = pluginDisposers;
            pluginDisposers = [];

            for (let index = disposers.length - 1; index >= 0; index -= 1) {
                disposers[index]();
            }
            app?.finalize();
            genomeSpy?.destroy();
            genomeSpy = undefined;
            element.replaceChildren();
        },
    });
}

/**
 *
 * @param {import("@genome-spy/core/genomeSpy.js").default} genomeSpy
 * @param {Record<string, any>} opt
 */
function applyOptions(genomeSpy, opt) {
    if (opt.namedDataProvider) {
        genomeSpy.registerNamedDataProvider(opt.namedDataProvider);
    }
}
