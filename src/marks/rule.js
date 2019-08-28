
import RectMark from './rectMark.js';

const defaultRenderConfig = {
    size: 1.0, // TODO: Provide through encoding
    minLength: 0.0
};

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
    }

    /**
     * @param {object[]} specs
     */
    setSpecs(specs) {
        if (specs.length == 0) {
            return;
        }

        const proto = Object.getPrototypeOf(specs[0]);
        const encoding = this.unitView.getEncoding();

        /** @type {function(object):void} */
        let sup;
        let vertical;

        if (encoding.x && !encoding.y) {
            // Vertical rule
            vertical = true;
            proto.y = -Infinity;
            proto.y2 = Infinity;
            sup = spec => { spec.x2 = spec.x };

        } else if (encoding.y && !encoding.x) {
            // Horizontal rule
            vertical = false;
            proto.x = -Infinity;
            proto.x2 = Infinity;
            sup = spec => { spec.y2 = spec.y };

        } else if (encoding.x && encoding.y && encoding.y2) {
            // Limited vertical rule
            vertical = true;
            sup = spec => { spec.x2 = spec.x };

        } else if (encoding.y && encoding.x && encoding.x2) {
            // Limited horizontal rule
            vertical = false;
            sup = spec => { spec.y2 = spec.y };

        } else {
            throw new Error("Invalid x and y encodings for rule mark: " + JSON.stringify(encoding));
        }

        specs.forEach(sup);

        const renderConfig = {
            ...defaultRenderConfig,
            ...this.unitView.getRenderConfig()
        }

        this.unitView.spec.renderConfig = this.unitView.spec.renderConfig || {};
        
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

        super.setSpecs(specs)
    }
}