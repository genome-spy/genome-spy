import { group } from 'd3-array';
import { processData } from '../data/dataMapper';
import Interval from '../utils/interval';

export default class Mark {

    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        this.unitView = unitView;
        this.markConfig = typeof unitView.spec.mark == "object" ? unitView.spec.mark : {};
    }
    
    getDefaultEncoding() {
        return {};
    }

    /**
     * Returns the encoding spec supplemented with mark's default encodings
     * @returns {Object.<string, import("../view/view").EncodingSpec>}
     */
    getEncoding() {
        return {
            ...this.getDefaultEncoding(),
            ...this.unitView.getEncoding()
        };
    }

    getContext() {
        return this.unitView.context;
    }

    async initializeData() {
        const data = this.unitView.getData();
        if (!data) {
            throw new Error("Can not initialize mark, no data available!");
        }
        const ungroupedData = data.ungroupAll().data;

        const encoding = this.getEncoding();

        const baseObject = {
            ...Mark.getConstantValues(encoding),
            _mark: this,
            _viewUnit: this.unitView
        };

        const specs = processData(encoding, ungroupedData, this.getContext().visualMapperFactory, baseObject);
        this.setSpecs(specs);
    }

    initializeGraphics() {
        this.gl = this.getContext().track.gl; // TODO: FIXME FIXME FIXME FIXME FIXME FIXME 
    }

    /**
     * @param {object[]} specs
     */
    setSpecs(specs) {
        if (this.getEncoding()["sample"]) {
            /** @type {Map<string, object[]>} */
            this.specsBySample = group(specs, d => d.sample);

        } else {
            this.specsBySample = new Map([["default", specs]]);
        }

        // For tooltips
        this.fieldMappers = specs.fieldMappers; 
    }

    onBeforeSampleAnimation() { }

    onAfterSampleAnimation() { }

    /**
     * TODO: Abstract away!
     */
    getYDomain() {
        // TODO: Resolved
        return /** @type {Interval} */(this.unitView.getResolution("y").getDomain());
    }

    /**
     * TODO: Abstract away!
     */
    getXDomain() {
        return this.getContext().genomeSpy.getDomain();
    }


    /**
     * @param {object[]} samples
     * @param {object} globalUniforms 
     */
    render(samples, globalUniforms) {
    }

    /**
     * @param {string} sampleId 
     * @param {number} x position on the range
     * @param {number} y position on the range
     * @param {import("../utils/interval").default} yBand the matched band on the band scale
     */
    findDatum(sampleId, x, y, yBand) {
        return null;
    }


    /**
     * @param {Object} encoding
     * @return {String[]}
     */
    static getVariableChannels(encoding) {
        // TODO: Test presence of field and chrom/pos instead of missingness value
        return Object.entries(encoding)
            .filter(entry => typeof entry[1].value == "undefined")
            .map(entry => entry[0]);
    }

    /**
     * @param {Object} encoding
     * @return {Object}
     */
    static getConstantValues(encoding) {
        return Object.fromEntries(
            Object.entries(encoding)
                .filter(entry => typeof entry[1].value != "undefined")
                .map(entry => [entry[0], entry[1].value]));
    }
}
