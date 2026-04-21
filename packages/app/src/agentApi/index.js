import { viewSettingsSlice } from "../viewSettingsSlice.js";
import { makeViewSelectorKey } from "../viewSettingsUtils.js";
import { resolveViewSelector as resolveCoreViewSelector } from "@genome-spy/core/view/viewSelectors.js";

/**
 * @typedef {import("./index.js").AgentApi} AgentApi
 */

/**
 * Creates the app-bound handle surface used by the extracted agent package.
 *
 * The returned object keeps `App` out of the agent call sites while still
 * exposing the concrete host capabilities the agent currently needs.
 *
 * @param {import("../app.js").default} app
 * @returns {AgentApi}
 */
export function createAgentApi(app) {
    return {
        getSampleHierarchy() {
            return app.getSampleView()?.sampleHierarchy;
        },

        /**
         * @param {import("../sampleView/types.d.ts").AttributeIdentifier} attribute
         * @returns {import("../sampleView/types.d.ts").AttributeInfo | undefined}
         */
        getSampleAttributeInfo(attribute) {
            const sampleView = app.getSampleView();
            if (!sampleView) {
                return;
            }

            return sampleView.compositeAttributeInfoSource.getAttributeInfo(
                attribute
            );
        },

        /**
         * @param {string} paramName
         */
        getSampleParamConfig(paramName) {
            const sampleView = app.getSampleView();
            if (!sampleView?.paramRuntime?.paramConfigs) {
                return;
            }

            return sampleView.paramRuntime.paramConfigs.get(paramName);
        },

        getSearchableViews() {
            return app.genomeSpy.getSearchableViews();
        },

        getViewRoot() {
            return app.genomeSpy.viewRoot;
        },

        /**
         * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
         * @returns {import("@genome-spy/core/view/view.js").default | undefined}
         */
        resolveViewSelector(selector) {
            const viewRoot = app.genomeSpy.viewRoot;
            if (!viewRoot) {
                return;
            }

            return resolveCoreViewSelector(viewRoot, selector);
        },

        getActionHistory() {
            return app.provenance.getActionHistory();
        },

        getPresentProvenanceState() {
            return app.provenance.getPresentState();
        },

        /**
         * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
         * @param {boolean} visibility
         */
        setViewVisibility(selector, visibility) {
            app.store.dispatch(
                viewSettingsSlice.actions.setVisibility({
                    key: makeViewSelectorKey(selector),
                    visibility,
                })
            );
        },

        /**
         * @param {string} provenanceId
         * @returns {boolean}
         */
        jumpToProvenanceState(provenanceId) {
            const currentIndex = app.provenance.getCurrentIndex();
            app.provenance.activateState(provenanceId);
            return app.provenance.getCurrentIndex() !== currentIndex;
        },

        /**
         * @returns {boolean}
         */
        jumpToInitialProvenanceState() {
            const currentIndex = app.provenance.getCurrentIndex();
            app.provenance.activateInitialState();
            return app.provenance.getCurrentIndex() !== currentIndex;
        },

        getAppContainer() {
            return app.appContainer;
        },
    };
}
