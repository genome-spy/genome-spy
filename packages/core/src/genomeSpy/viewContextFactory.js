/**
 * @typedef {import("../types/viewContext.js").default} ViewContext
 */

/**
 * Creates a ViewContext from a partial input. Omitted fields default to
 * "fail-fast" placeholders that throw when called. This lets tests supply only
 * what they need while keeping production usage explicit.
 *
 * @param {Partial<ViewContext> & {
 *   createOrImportViewWithContext?: (context: ViewContext, spec: import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec, layoutParent?: import("../view/containerView.js").default, dataParent?: import("../view/view.js").default, defaultName?: string, validator?: (spec: import("../spec/view.js").ViewSpec) => void) => Promise<import("../view/view.js").default>
 * }} options
 * @returns {ViewContext}
 */
export function createViewContext(options) {
    /** @param {string} name */
    const missing = (name) => {
        throw new Error("ViewContext." + name + " is not configured.");
    };
    /** @type {Partial<ViewContext>} */
    const context = {
        dataFlow: options.dataFlow ?? missing("dataFlow"),
        glHelper: options.glHelper ?? missing("glHelper"),
        animator: options.animator ?? missing("animator"),
        genomeStore: options.genomeStore,
        fontManager: options.fontManager ?? missing("fontManager"),
        createOrImportView: async function (
            spec,
            layoutParent,
            dataParent,
            defaultName,
            validator
        ) {
            const create = options.createOrImportViewWithContext;
            if (!create) {
                return Promise.reject(
                    new Error(
                        "ViewContext.createOrImportView is not configured."
                    )
                );
            }

            // Needs the fully wired context for recursive view creation.
            return create(
                /** @type {ViewContext} */ (context),
                spec,
                layoutParent,
                dataParent,
                defaultName,
                validator
            );
        },
    };

    /** @type {(keyof ViewContext)[]} */
    const methodNames = [
        "requestLayoutReflow",
        "updateTooltip",
        "getNamedDataFromProvider",
        "getCurrentHover",
        "addKeyboardListener",
        "addBroadcastListener",
        "removeBroadcastListener",
        "highlightView",
        "isViewConfiguredVisible",
        "isViewSpec",
    ];

    /** @type {Partial<ViewContext>} */
    const optionValues = options;
    const contextAny = /** @type {any} */ (context);

    for (const name of methodNames) {
        contextAny[name] = optionValues[name] ?? (() => missing(name));
    }

    return /** @type {ViewContext} */ (context);
}
