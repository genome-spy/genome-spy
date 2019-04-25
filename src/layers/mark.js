


export default class Mark {

    /**
     * @param {import("./viewUnit").UnitContext} unitContext
     * @param {import("./viewUnit").default} viewUnit
     */
    constructor(unitContext, viewUnit) {
        this.unitContext = unitContext;
        this.gl = unitContext.sampleTrack.gl;
        this.viewUnit = viewUnit;
    }

    async initialize() {
        this._initGL();
    }

    /**
     * 
     * @param {Map<string, object[]>} specs Mark specs keyed by sampleId
     */
    setSpecs(specs) {
        this.specsBySample = specs;

    }

    _initGL() {

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
}