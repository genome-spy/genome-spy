


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
     * @param {number} pos position on the domain
     */
    findDatum(sampleId, pos) {
        return null;
    }
}