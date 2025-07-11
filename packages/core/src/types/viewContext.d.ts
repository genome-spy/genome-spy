import { TemplateResult } from "lit";
import View, { BroadcastMessage } from "../view/view.js";
import DataFlow from "../data/dataFlow.js";
import WebGLHelper from "../gl/webGLHelper.js";
import Animator from "../utils/animator.js";
import GenomeStore from "../genome/genomeStore.js";
import BmFontManager from "../fonts/bmFontManager.js";
import Mark from "../marks/mark.js";
import { Datum } from "../data/flowNode.js";
import { ImportSpec, ViewSpec } from "../spec/view.js";
import ContainerView from "../view/containerView.js";
import { BroadcastEventType } from "../genomeSpy.js";

export interface Hover {
    mark: Mark;
    datum: Datum;
}

export type DataLoadingStatus = "loading" | "complete" | "error";

/**
 * ViewContext provides essential data and interfaces to View classes.
 */
export default interface ViewContext {
    dataFlow: DataFlow<View>;
    glHelper: WebGLHelper;
    animator: Animator;
    genomeStore?: GenomeStore;
    fontManager: BmFontManager;

    requestLayoutReflow: () => void;

    updateTooltip: <T>(
        datum: T,
        converter?: (datum: T) => Promise<TemplateResult>
    ) => void;

    getCurrentHover: () => Hover;

    /**
     * Adds a keyboard event listener to the document. Cleanup is performed automatically
     * when GenomeSpy is finalized.
     *
     * TODO: Listeners should be called only when the mouse pointer is inside the
     * container or the app covers the full document.
     */
    addKeyboardListener: (
        type: "keydown" | "keyup",
        listener: (event: KeyboardEvent) => void
    ) => void;

    /**
     * Registers a listener for broadcast messages.
     * Typically broadcast messages are automatically broadcasted to all views.
     * However, in some cases non-view components may be interested in these messages.
     */
    addBroadcastListener: (
        type: BroadcastEventType,
        listener: (message: BroadcastMessage) => void
    ) => void;

    removeBroadcastListener: (
        type: BroadcastEventType,
        listener: (message: BroadcastMessage) => void
    ) => void;

    getNamedDataFromProvider: (name: string) => any[];

    /**
     * Allows lazy data sources to signal that they are loading data.
     * The status is shown in the UI somewhere within or near the view.
     *
     * @param view The view where the data source is located.
     * @param status
     * @param detail Details about the error, if any.
     */
    setDataLoadingStatus: (
        view: View,
        status: DataLoadingStatus,
        detail?: string
    ) => void;

    /**
     * Highlights a view by adding a border around it. This is useful for debugging.
     *
     * @param view The view to highlight. Null to remove the highlight.
     * @returns
     */
    highlightView?: (view: View | null) => void;

    /**
     * Returns true if the view is configured to be visible.
     * N.B. This does NOT consider ancestors' visibility.
     */
    isViewConfiguredVisible: (view: View) => boolean;

    isViewSpec: (spec: any) => boolean;

    /**
     *
     * @param spec
     * @param layoutParent
     * @param dataParent
     * @param defaultName
     * @param validator
     * @returns
     */
    createOrImportView: (
        spec: ViewSpec | ImportSpec,
        layoutParent?: ContainerView,
        dataParent?: View,
        defaultName?: string,
        /**
         * Validates whether the imported spec is acceptable for the importer.
         * The function should throw an Error if the view is not acceptable.
         */
        validator?: (spec: ViewSpec) => void
    ) => Promise<View>;
}
