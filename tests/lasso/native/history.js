import { configureStore } from "@reduxjs/toolkit";
import { ActionCreators } from "redux-undo";
import { createProvenanceReducer } from "../../../packages/app/src/state/provenanceReducerBuilder.js";
import {
    getParamChangeGroupKey,
    paramProvenanceSlice,
} from "../../../packages/app/src/state/paramProvenanceSlice.js";
import ParamProvenanceBridge from "../../../packages/app/src/state/paramProvenanceBridge.js";
import IntentExecutor from "../../../packages/app/src/state/intentExecutor.js";

/** Private host for real App provenance over the native Core fixture.
 * @param {import("@genome-spy/core/types/embedApi.js").EmbedResult} api
 */
export function setupHistory(api) {
    const root =
        /** @type {import("@genome-spy/core/view/view.js").default} */ (
            api.debug.getViewRoot()
        );
    /** @type {import("@genome-spy/core/view/viewUtilTypes.js").ParamSelector} */
    const selector = { scope: [], param: "lasso" };
    const store = configureStore({
        reducer: {
            provenance: createProvenanceReducer(
                { paramProvenance: paramProvenanceSlice.reducer },
                { groupBy: getParamChangeGroupKey }
            ),
        },
    });
    store.dispatch(
        paramProvenanceSlice.actions.paramChange({
            selector,
            value: { type: "region", intent: null },
        })
    );
    const bridge = new ParamProvenanceBridge({
        root,
        store,
        intentExecutor: new IntentExecutor(store),
    });
    document.getElementById("history").hidden = false;
    const undo = /** @type {HTMLButtonElement} */ (
        document.getElementById("undo")
    );
    const redo = /** @type {HTMLButtonElement} */ (
        document.getElementById("redo")
    );
    const save = /** @type {HTMLButtonElement} */ (
        document.getElementById("save")
    );
    const restore = /** @type {HTMLButtonElement} */ (
        document.getElementById("restore")
    );
    let saved = "";
    const update = () => {
        const history = store.getState().provenance;
        undo.disabled = history.past.length === 0;
        redo.disabled = history.future.length === 0;
        save.disabled = !api.params.getSelection("lasso").getValue().active;
        restore.disabled = !saved;
    };
    /** @param {Error} error */
    const report = (error) => {
        document.getElementById("status").textContent = error.message;
    };
    /** @param {import("@reduxjs/toolkit").UnknownAction} action */
    const apply = (action) => {
        store.dispatch(action);
        void bridge.whenApplied().catch(report);
    };
    undo.onclick = () => apply(ActionCreators.undo());
    redo.onclick = () => apply(ActionCreators.redo());
    save.onclick = () => {
        saved = JSON.stringify(
            Object.values(
                store.getState().provenance.present.paramProvenance.entries
            )
        );
        update();
    };
    restore.onclick = () => {
        for (const entry of JSON.parse(saved))
            apply(paramProvenanceSlice.actions.paramChange(entry));
    };
    const unsubscribe = store.subscribe(update);
    update();
    /** @type {any} */ (globalThis).__lassoHistory = {
        store,
        bridge,
        getSaved: () => saved,
    };
    return () => {
        unsubscribe();
        bridge.dispose();
    };
}
