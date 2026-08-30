/**
 * Renderer-lifetime cache for immutable mark program resources.
 */
export class ProgramTemplateCache {
    /**
     * @param {(name: "programTemplateCacheHits"|"programTemplateCacheMisses") => void} count
     */
    constructor(count) {
        this._count = count;
        /** @type {Map<string, Map<string, import("./pipelineBuilder.js").ProgramTemplate>>} */
        this._templatesByShader = new Map();
        this._nextId = 1;
    }

    /**
     * @param {string} shaderCode
     * @param {string} descriptorKey
     * @param {(id: number) => import("./pipelineBuilder.js").ProgramTemplate} create
     * @returns {import("./pipelineBuilder.js").ProgramTemplate}
     */
    getOrCreate(shaderCode, descriptorKey, create) {
        let templates = this._templatesByShader.get(shaderCode);
        const existing = templates?.get(descriptorKey);
        if (existing) {
            this._count("programTemplateCacheHits");
            return existing;
        }

        if (!templates) {
            templates = new Map();
            this._templatesByShader.set(shaderCode, templates);
        }
        const template = create(this._nextId++);
        templates.set(descriptorKey, template);
        this._count("programTemplateCacheMisses");
        return template;
    }
}
