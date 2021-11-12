import { TemplateResult } from "lit";
import View from "./view";
import DataFlow from "../data/dataFlow";
import AccessorFactory from "../encoder/accessor";
import WebGLHelper from "../gl/webGLHelper";
import Animator from "../utils/animator";
import GenomeStore from "../genome/genomeStore";
import { MenuOptions } from "../utils/ui/contextMenu";
import BmFontManager from "../fonts/bmFontManager";
import Mark from "../marks/mark";
import { Datum } from "../data/flowNode";
import { ViewSpec } from "../spec/view";
import ContainerView from "./containerView";

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

    contextMenu: (options: MenuOptions, mouseEvent: MouseEvent) => void;

    getCurrentHover: () => { mark: Mark; datum: Datum };

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

    getNamedData: (name: string) => any[];

    isViewVisible: (view: View) => boolean;

    isViewSpec: (spec: any) => boolean;

    createView: (
        spec: ViewSpec,
        parent?: ContainerView,
        defaultName?: string
    ) => View;
}
