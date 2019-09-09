
import RectMark from './rectMark.js';

const defaultRenderConfig = {
    size: 1.0, // TODO: Provide through encoding
    minLength: 0.0
};

/** @type {import("../view/viewUtils").EncodingSpecs} */
const defaultEncoding = {
    x:  null,
    x2: null,
    y:  null,
    y2: null 
};

const verticalSym = Symbol("Vertical");

/**
 * Rule mark is just a special case of rect mark. However, it provides
 * a more straightforward configuration for rules.
 */
export default class RuleMark extends RectMark {

    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView)

        const renderConfig = {
            ...defaultRenderConfig,
            ...this.unitView.getRenderConfig()
        }

        this.unitView.spec.renderConfig = this.unitView.spec.renderConfig || {};
        
        const encoding = this.getEncoding();
        const vertical = encoding[verticalSym];

        Object.assign(this.unitView.spec.renderConfig, vertical ?
            {
                minRectWidth: renderConfig.size,
                minRectHeight: renderConfig.minLength,
                minRectOpacity: 1.0
            } :
            {
                minRectWidth: renderConfig.minLength,
                minRectHeight: renderConfig.size,
                minRectOpacity: 1.0
            }); 

    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    getEncoding() {
        const encoding = {...super.getEncoding()};
        let vertical;

        if (encoding.x && !encoding.y) {
            // Vertical rule
            vertical = true;
            encoding.y =  { value: -Infinity };
            encoding.y2 = { value:  Infinity };
            encoding.x2 = encoding.x;

        } else if (encoding.y && !encoding.x) {
            // Horizontal rule
            vertical = false;
            encoding.x =  { value: -Infinity };
            encoding.x2 = { value:  Infinity };
            encoding.y2 = encoding.y;

        } else if (encoding.x && encoding.y && encoding.y2) {
            // Limited vertical rule
            vertical = true;
            encoding.x2 = encoding.x;

        } else if (encoding.y && encoding.x && encoding.x2) {
            // Limited horizontal rule
            vertical = false;
            encoding.y2 = encoding.y;

        } else {
            throw new Error("Invalid x and y encodings for rule mark: " + JSON.stringify(encoding));
        }

        encoding[verticalSym] = vertical;

        return encoding;
    }
}