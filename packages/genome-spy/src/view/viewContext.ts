import { TemplateResult } from "lit-html";
import View from "../view/view";
import DataFlow from "../data/dataFlow";
import AccessorFactory from "../encoder/accessor";
import WebGLHelper from "../gl/webGLHelper";
import Animator from "../utils/animator";
import GenomeStore from "../genome/genomeStore";
import { MenuOptions } from "../utils/ui/contextMenu";

export default interface ViewContext {
    dataFlow: DataFlow<View>;
    accessorFactory: AccessorFactory;
    glHelper: WebGLHelper;
    animator: Animator;
    genomeStore?: GenomeStore;

    requestLayoutReflow: () => void;

    updateTooltip: <T>(
        datum: T,
        converter?: (datum: T) => string | TemplateResult
    ) => void;

    contextMenu: (options: MenuOptions, mouseEvent: MouseEvent) => void;
}
