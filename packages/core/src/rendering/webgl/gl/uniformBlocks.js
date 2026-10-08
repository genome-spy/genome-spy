import { createUniformBlockInfo, glEnumToString } from "twgl.js";

/**
 * Supplies trailing std140 padding expected by TWGL and adds failure diagnostics.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {import("twgl.js").ProgramInfo} programInfo
 * @param {string} blockName
 * @param {{ view: string, mark: string }} context
 * @returns {import("twgl.js").UniformBlockInfo}
 */
export function createUniformBlockInfoWithDiagnostics(
    gl,
    programInfo,
    blockName,
    context
) {
    const spec = programInfo.uniformBlockSpec;
    const block = spec.blockSpecs[blockName];
    let paddedProgramInfo = programInfo;
    if (block && block.size % 16 !== 0) {
        // Mali may report the end of the last value without trailing padding.
        // TWGL's array views include that padding. Keep the original reflection
        // intact for diagnostics. https://github.com/genome-spy/genome-spy/issues/554
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

    try {
        return createUniformBlockInfo(gl, paddedProgramInfo, blockName);
    } catch (error) {
        try {
            logUniformBlockFailure(gl, programInfo, blockName, context, error);
        } catch (diagnosticError) {
            console.error(
                "GenomeSpy could not collect uniform block diagnostics",
                context,
                blockName,
                diagnosticError
            );
        }

        throw error;
    }
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {import("twgl.js").ProgramInfo} programInfo
 * @param {string} blockName
 * @param {{ view: string, mark: string }} context
 * @param {unknown} error
 */
function logUniformBlockFailure(gl, programInfo, blockName, context, error) {
    const { blockSpecs, uniformData } = programInfo.uniformBlockSpec;
    const block = blockSpecs[blockName];
    const indices = Array.from(block.uniformIndices);
    const arrayStrides = gl.getActiveUniforms(
        programInfo.program,
        indices,
        gl.UNIFORM_ARRAY_STRIDE
    );
    const matrixStrides = gl.getActiveUniforms(
        programInfo.program,
        indices,
        gl.UNIFORM_MATRIX_STRIDE
    );
    const rowMajor = gl.getActiveUniforms(
        programInfo.program,
        indices,
        gl.UNIFORM_IS_ROW_MAJOR
    );

    const uniforms = indices.map((index, i) => {
        const uniform = uniformData[index];
        const type = glEnumToString(gl, uniform.type);
        // Match TWGL 4.x's typed-array sizing, including trailing array padding.
        const matrix = /FLOAT_MAT([234])/.exec(type);
        const vector = /VEC([234])/.exec(type);
        const elementBytes = matrix
            ? Number(matrix[1]) * 16
            : vector
              ? Number(vector[1]) * 4
              : 4;
        const byteLength = uniform.name.endsWith("[0]")
            ? Math.ceil(elementBytes / 16) * 16 * uniform.size
            : elementBytes * uniform.size;
        const endOffset = uniform.offset + byteLength;

        return {
            name: uniform.name,
            type,
            typeEnum: uniform.type,
            count: uniform.size,
            offset: uniform.offset,
            arrayStride: arrayStrides[i],
            matrixStride: matrixStrides[i],
            rowMajor: rowMajor[i],
            twglByteLength: byteLength,
            twglEndOffset: endOffset,
            exceedsBlock: endOffset > block.size,
        };
    });

    const declarations = new Set(
        (gl.getAttachedShaders(programInfo.program) ?? []).flatMap((shader) =>
            Array.from(
                (gl.getShaderSource(shader) ?? "").matchAll(
                    /(?:layout\s*\([^)]*\)\s*)?uniform\s+\w+\s*\{[^}]*\}\s*(?:\w+(?:\s*\[[^\]]*\])?)?\s*;/g
                ),
                (match) => match[0]
            )
        )
    );

    // Serialize immediately so the report is stable and easy to copy from a phone.
    console.error(
        "GenomeSpy uniform block initialization failed",
        JSON.stringify(
            {
                ...context,
                block: blockName,
                blockSize: block.size,
                uniforms,
                declarations: Array.from(declarations),
            },
            null,
            2
        ),
        error
    );
}
