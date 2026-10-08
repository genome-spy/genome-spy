import { createUniformBlockInfo as createTwglUniformBlockInfo } from "twgl.js";

/**
 * Supplies trailing std140 padding expected by TWGL's array views.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {import("twgl.js").ProgramInfo} programInfo
 * @param {string} blockName
 * @returns {import("twgl.js").UniformBlockInfo}
 */
export function createUniformBlockInfo(gl, programInfo, blockName) {
    const spec = programInfo.uniformBlockSpec;
    const block = spec.blockSpecs[blockName];
    let paddedProgramInfo = programInfo;
    if (block && block.size % 16 !== 0) {
        // Some Mali devices omit trailing array padding from the reported size,
        // but TWGL's typed-array views include it. Preserve the original reflection.
        // https://github.com/genome-spy/genome-spy/issues/554
        paddedProgramInfo = {
            ...programInfo,
            uniformBlockSpec: {
                ...spec,
                blockSpecs: {
                    ...spec.blockSpecs,
                    [blockName]: {
                        ...block,
                        size: Math.ceil(block.size / 16) * 16,
                    },
                },
            },
        };
    }

    return createTwglUniformBlockInfo(gl, paddedProgramInfo, blockName);
}
