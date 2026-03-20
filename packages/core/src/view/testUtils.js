/**
 * Utils for Jest tests
 * TODO: Find a better place and convention
 *
 * @typedef {import("../spec/root.js").RootSpec} RootSpec
 * @typedef {import("../types/viewContext.js").default} ViewContext
 */

import { checkForDuplicateScaleNames } from "./viewUtils.js";
import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import DataFlow from "../data/dataFlow.js";
import { VIEW_ROOT_NAME, ViewFactory } from "./viewFactory.js";
import GenomeStore from "../genome/genomeStore.js";
import BmFontManager from "../fonts/bmFontManager.js";
import UnitView from "./unitView.js";
import ContainerView from "./containerView.js";
import { INTERNAL_DEFAULT_CONFIG } from "../config/defaultConfig.js";
import { resolveBaseConfig } from "../config/resolveConfig.js";

/**
 * @param {import("./viewFactory.js").ViewFactoryOptions} [viewFactoryOptions]
 * @returns
 */
export function createTestViewContext(viewFactoryOptions = {}) {
    const viewFactory = new ViewFactory({
        allowImport: false,
        wrapRoot: false,
        ...viewFactoryOptions,
    });

    const genomeStore = new GenomeStore(".");
    genomeStore.initialize({
        name: "test",
        contigs: [
            { name: "chr1", size: 20 },
            { name: "chr2", size: 30 },
        ],
    });

    const dataFlow = new DataFlow();
    const baseConfig = resolveBaseConfig({
        defaultConfig: INTERNAL_DEFAULT_CONFIG,
    });

    // @ts-expect-error
    const c = /** @type {ViewContext} */ ({
        createOrImportView: async function (
            spec,
            parent,
            dataParent,
            defaultName,
            validator,
            options
        ) {
            return viewFactory.createOrImportView(
                spec,
                this,
                parent,
                dataParent,
                defaultName,
                validator,
                options
            );
        },

        dataFlow,
        genomeStore,

        fontManager: new BmFontManager(),
        animator: /** @type {import("../utils/animator.js").default} */ (
            /** @type {any} */ ({
                requestRender: /** @type {() => void} */ (() => undefined),
                requestTransition:
                    /** @type {(callback: () => void) => void} */ (
                        (callback) => callback()
                    ),
                transition: (/** @type {any} */ options) => {
                    const to = typeof options.to === "number" ? options.to : 1;
                    options.onUpdate(to);
                    return Promise.resolve();
                },
            })
        ),

        requestLayoutReflow: () => undefined,
        suspendHoverTracking: () => undefined,
        resumeHoverTracking: () => undefined,

        isViewConfiguredVisible: () => true,
        getBaseConfig: () => baseConfig,

        addBroadcastListener: () => undefined,
        removeBroadcastListener: () => undefined,

        //...partialContext,
    });

    return c;
}

/**
 * @type {<V extends import("./view.js").default>(spec: RootSpec, viewClass: { new(...args: any[]): V }, ViewFactoryOptions?: import("./viewFactory.js").ViewFactoryOptions) => Promise<V>}
 */
export async function create(spec, viewClass, viewFactoryOptions = {}) {
    const c = createTestViewContext(viewFactoryOptions);
    const view = await c.createOrImportView(
        /** @type {import("../spec/view.js").ViewSpec} */ (spec),
        null,
        null,
        VIEW_ROOT_NAME
    );

    if (!(view instanceof viewClass)) {
        throw new Error("ViewClass and the spec do not match!");
    }

    return view;
}

/**
 * Creates a view and initializes its data. Does not wrap it in an implicit root view.
 *
 * @type {<V extends import("./view.js").default>(spec: RootSpec, viewClass: { new(...args: any[]): V }, context?: ViewContext, options?: {noData: boolean, implicitRoot: boolean}) => Promise<V>}
 */
export async function createAndInitialize(spec, viewClass) {
    const view = await create(spec, viewClass);

    checkForDuplicateScaleNames(view);
    if (view instanceof UnitView) {
        view.mark.initializeEncoders();
    } else if (view instanceof ContainerView) {
        view.visit((v) => {
            if (v instanceof UnitView) {
                v.mark.initializeEncoders();
            }
        });
    }

    const { dataSources } = initializeViewSubtree(view, view.context.dataFlow);
    await loadViewSubtreeData(view, dataSources);
    return view;
}
