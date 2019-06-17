import { group } from 'd3-array';
import { processData } from '../data/dataMapper';
import Interval from '../utils/interval';

export default class Mark {

    /**
     * @param {import("./viewUnit").UnitContext} unitContext
     * @param {import("./viewUnit").default} viewUnit
     */
    constructor(unitContext, viewUnit) {
        this.unitContext = unitContext;
        this.gl = unitContext.track.gl;
        this.viewUnit = viewUnit;
        this.markConfig = typeof viewUnit.config.mark == "object" ? viewUnit.config.mark : {};
    }
    
    getDefaultEncoding() {
        return {};
    }

    getEncoding() {
        return Object.assign({}, this.getDefaultEncoding(), this.viewUnit.getEncoding());
    }

    async initialize() {
        const data = this.viewUnit.getData();
        if (!data) {
            throw new Error("Can not initialize mark, no data available!");
        }
        const ungroupedData = data.ungroupAll().data;

        const encoding = this.getEncoding();

        const baseObject = {
            ...Mark.getConstantValues(encoding),
            _mark: this,
            _viewUnit: this.viewUnit
        };

        const specs = processData(encoding, ungroupedData, this.viewUnit.context.genomeSpy.visualMapperFactory, baseObject);
        this.setSpecs(specs);

        this._initGL();
    }

    /**
     * @param {object[]} specs
     */
    setSpecs(specs) {
        this.dataDomains = this.extractDataDomains(specs);

        if (this.viewUnit.getEncoding()["sample"]) {
            /** @type {Map<string, object[]>} */
            this.specsBySample = group(specs, d => d.sample);

        } else {
            this.specsBySample = new Map([["default", specs]]);
        }

        // For tooltips
        this.fieldMappers = specs.fieldMappers; 
    }

    extractDataDomains(specs) {
        // override in subclasses!
        // TODO: Figure out where to get domains for color/size attributes etc
        return {
            x: new Interval(0, 1),
            y: new Interval(0, 1)
        };
    }

    onBeforeSampleAnimation() { }

    onAfterSampleAnimation() { }

    _initGL() {

    }


    getResolvedYDomain() {
        // TODO: Implement
    }

    getYDomain() {
        return this.getDomain("y");
    }

    getXDomain() {
        return this.getDomain("x");
    }

    /**
     * 
     * @param {string} dimension 
     * @returns {Interval}
     */
    getDomain(dimension) {
        const encoding = this.viewUnit.getEncoding()[dimension];
        if (encoding) {
            const scale = encoding.scale;
            if (scale) {
                const domain = scale.domain;
                if (domain) {
                    if (Array.isArray(domain) && domain.length == 2) {
                        // TODO: Support nominal/ordinal
                        return Interval.fromArray(domain);
                    } else {
                        throw new Error("Invalid domain: " + JSON.stringify(domain));
                    }
                }
            }
        }

        return this.dataDomains[dimension];
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
