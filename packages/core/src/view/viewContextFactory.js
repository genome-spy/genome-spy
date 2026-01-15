/**
 * @typedef {import("../types/viewContext.js").default} ViewContext
 */

/**
 * @typedef {object} ViewContextOptions
 * @property {import("../data/dataFlow.js").default} dataFlow
 * @property {import("../gl/webGLHelper.js").default} glHelper
 * @property {import("../utils/animator.js").default} animator
 * @property {import("../genome/genomeStore.js").default} [genomeStore]
 * @property {import("../fonts/bmFontManager.js").default} fontManager
 * @property {(datum: any, converter?: (datum: any) => Promise<import("lit").TemplateResult | string | HTMLElement>) => void} updateTooltip
 * @property {(name: string) => any[]} getNamedDataFromProvider
 * @property {() => import("../types/viewContext.js").Hover} getCurrentHover
 * @property {(view: import("./view.js").default, status: import("../types/viewContext.js").DataLoadingStatus, detail?: string) => void} setDataLoadingStatus
 * @property {(type: "keydown" | "keyup", listener: (event: KeyboardEvent) => void) => void} addKeyboardListener
 * @property {(type: import("../genomeSpy.js").BroadcastEventType, listener: (message: import("./view.js").BroadcastMessage) => void) => void} addBroadcastListener
 * @property {(type: import("../genomeSpy.js").BroadcastEventType, listener: (message: import("./view.js").BroadcastMessage) => void) => void} removeBroadcastListener
 * @property {(view: import("./view.js").default | null) => void} highlightView
 * @property {(view: import("./view.js").default) => boolean} isViewConfiguredVisible
 * @property {(spec: any) => boolean} isViewSpec
 * @property {(context: ViewContext, spec: import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec, layoutParent?: import("./containerView.js").default, dataParent?: import("./view.js").default, defaultName?: string, validator?: (spec: import("../spec/view.js").ViewSpec) => void) => Promise<import("./view.js").default>} createOrImportView
 */

/**
 * @param {ViewContextOptions} options
 * @returns {ViewContext}
 */
export function createViewContext(options) {
    /** @type {ViewContext} */
    const context = {
        dataFlow: options.dataFlow,
        glHelper: options.glHelper,
        animator: options.animator,
        genomeStore: options.genomeStore,
        fontManager: options.fontManager,

        requestLayoutReflow: () => {
            // placeholder
        },
        updateTooltip: options.updateTooltip,
        getNamedDataFromProvider: options.getNamedDataFromProvider,
        getCurrentHover: options.getCurrentHover,
        setDataLoadingStatus: options.setDataLoadingStatus,
        addKeyboardListener: options.addKeyboardListener,
        addBroadcastListener: options.addBroadcastListener,
        removeBroadcastListener: options.removeBroadcastListener,
        highlightView: options.highlightView,
        isViewConfiguredVisible: options.isViewConfiguredVisible,
        isViewSpec: options.isViewSpec,
        createOrImportView: async function (
            spec,
            layoutParent,
            dataParent,
            defaultName,
            validator
        ) {
            return options.createOrImportView(
                context,
                spec,
                layoutParent,
                dataParent,
                defaultName,
                validator
            );
        },
    };

    return context;
}
