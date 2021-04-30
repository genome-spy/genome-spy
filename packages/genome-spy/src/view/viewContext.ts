import { TemplateResult } from "lit-html";
import View from "../view/view";
import DataFlow from "../data/dataFlow";
import AccessorFactory from "../encoder/accessor";
import WebGLHelper from "../gl/webGLHelper";
import Animator from "../utils/animator";
import GenomeStore from "../genome/genomeStore";
import { MenuOptions } from "../utils/ui/contextMenu";
import BmFontManager from "../fonts/bmFontManager";
import Mark from "../marks/mark";
import { Datum } from "../data/flowNode";

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
}
