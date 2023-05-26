import { TemplateResult } from "lit-html";
import View, { BroadcastMessage } from "../view/view";
import DataFlow from "../data/dataFlow";
import AccessorFactory from "../encoder/accessor";
import WebGLHelper from "../gl/webGLHelper";
import Animator from "../utils/animator";
import GenomeStore from "../genome/genomeStore";
import BmFontManager from "../fonts/bmFontManager";
import Mark from "../marks/mark";
import { Datum } from "../data/flowNode";
import { ViewSpec } from "../spec/view";
import ContainerView from "./containerView";
import { BroadcastEventType } from "../genomeSpy";

export interface Hover {
    mark: Mark;
    datum: Datum;
}

/**
 * ViewContext provides essential data and interfaces to View classes.
 */
export default interface ViewContext {
    dataFlow: DataFlow<View>;
    accessorFactory: AccessorFactory;
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
     * Returns true if the view is configured to be visible.
     * N.B. This does NOT consider ancestors' visibility.
     */
    isViewConfiguredVisible: (view: View) => boolean;

    isViewSpec: (spec: any) => boolean;

    createView: (
        spec: ViewSpec,
        parent?: ContainerView,
        defaultName?: string
    ) => View;
}
