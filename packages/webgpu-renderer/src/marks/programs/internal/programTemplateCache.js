/**
 * Renderer-lifetime cache for immutable mark program resources.
 */
export class ProgramTemplateCache {
    /** @type {(name: "programTemplateCacheHits"|"programTemplateCacheMisses") => void} */
    #count;

    /** @type {Map<string, Map<string, import("./pipelineBuilder.js").ProgramTemplate>>} */
    #templatesByShader = new Map();

    #nextId = 1;

    /**
     * @param {(name: "programTemplateCacheHits"|"programTemplateCacheMisses") => void} count
     */
    constructor(count) {
        this.#count = count;
    }

    /**
     * @param {string} shaderCode
     * @param {string} descriptorKey
     * @param {(id: number) => import("./pipelineBuilder.js").ProgramTemplate} create
     * @returns {import("./pipelineBuilder.js").ProgramTemplate}
     */
    getOrCreate(shaderCode, descriptorKey, create) {
        let templates = this.#templatesByShader.get(shaderCode);
        const existing = templates?.get(descriptorKey);
        if (existing) {
            this.#count("programTemplateCacheHits");
            return existing;
        }

        if (!templates) {
            templates = new Map();
            this.#templatesByShader.set(shaderCode, templates);
        }
        const template = create(this.#nextId++);
        templates.set(descriptorKey, template);
        this.#count("programTemplateCacheMisses");
        return template;
    }
}
