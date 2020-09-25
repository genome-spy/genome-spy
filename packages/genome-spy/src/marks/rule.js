import RectMark from "./rectMark.js";

const defaultMarkProperties = {
    size: 1.0, // TODO: Provide through encoding
    minLength: 0.0
};

/** @type {import("../view/viewUtils").EncodingSpecs} */
const defaultEncoding = {
    x: null,
    x2: null,
    y: null,
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
        super(unitView);

        /** @type {Record<string, any>} */
        this.properties = {
            ...defaultMarkProperties,
            ...this.properties
        };

        const encoding = this.getEncoding();
        const vertical = encoding[verticalSym];

        const props = this.properties;

        Object.assign(
            this.properties,
            vertical
                ? {
                      minWidth: props.size,
                      minHeight: props.minLength,
                      minOpacity: 1.0
                  }
                : {
                      minWidth: props.minLength,
                      minHeight: props.size,
                      minOpacity: 1.0
                  }
        );
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    getEncoding() {
        // Inference of y & y2 of rect mark is incompatible with rule mark
        const encoding = {
            ...this.getDefaultEncoding(),
            ...this.unitView.getEncoding()
        };

        let vertical;

        if (encoding.x && !encoding.y) {
            // Vertical rule
            vertical = true;
            encoding.y = { value: 0 };
            encoding.y2 = { value: 1 };
            encoding.x2 = encoding.x;
        } else if (encoding.y && !encoding.x) {
            // Horizontal rule
            vertical = false;
            encoding.x = { value: 0 };
            encoding.x2 = { value: 1 };
            encoding.y2 = encoding.y;
        } else if (encoding.x && encoding.y && encoding.y2) {
            // Limited vertical rule
            vertical = true;
            encoding.x2 = encoding.x;
        } else if (encoding.y && encoding.x && encoding.x2) {
            // Limited horizontal rule
            vertical = false;
            encoding.y2 = encoding.y;
        } else if (
            encoding.y &&
            encoding.x &&
            !encoding.x2 &&
            encoding.y.type == "quantitative" &&
            !encoding.y2
        ) {
            vertical = true;
            encoding.x2 = encoding.x;
            encoding.y2 = { datum: 0 };
        } else {
            throw new Error(
                "Invalid x and y encodings for rule mark: " +
                    JSON.stringify(encoding)
            );
        }

        encoding[verticalSym] = vertical;

        return encoding;
    }
}
