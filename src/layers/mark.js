


export default class Mark {

    /**
     * @param {import("./viewUnit").UnitContext} unitContext
     */
    constructor(unitContext) {
        this.unitContext = unitContext;
        this.gl = unitContext.sampleTrack.gl;
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
     * @param {string} sampleId 
     * @param {object} uniforms 
     */
    render(sampleId, uniforms) {
    }

    /**
     * @param {string} sampleId 
     * @param {number} pos position on the domain
     */
    findDatum(sampleId, pos) {
        return null;
    }
}