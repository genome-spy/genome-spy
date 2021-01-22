import { TemplateResult } from "lit-html";
import View from "../view/view";
import DataFlow from "../data/dataFlow";
import AccessorFactory from "../encoder/accessor";
import CoordinateSystem from "../coordinateSystem";
import WebGLHelper from "../gl/webGLHelper";
import Animator from "../utils/animator";

export default interface ViewContext {
    dataFlow: DataFlow<View>;
    accessorFactory: AccessorFactory;
    coordinateSystem: CoordinateSystem;
    glHelper: WebGLHelper;
    animator: Animator;

    requestLayoutReflow: () => void;

    updateTooltip: <T>(
        datum: T,
        converter?: (arg0: T) => string | TemplateResult
    ) => void;
}
