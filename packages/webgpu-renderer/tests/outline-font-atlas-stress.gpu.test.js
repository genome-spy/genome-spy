/* global document */

import { expect, test } from "@playwright/test";

import { ensureWebGPU } from "./gpuTestUtils.js";

test("outline atlas grows repeatedly across thousands of dynamic labels", async ({
    page,
}) => {
    test.setTimeout(90_000);
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { textMark },
            { identityScale },
            {
                createLabelPositions,
                createSyntheticLabels,
                createSyntheticOutlineFont,
            },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/text.js"),
            import("/src/scales/identity.js"),
            import("/tests/fixtures/syntheticOutlineFont.js"),
        ]);

        const labelCount = 4096;
        const glyphsPerRound = 64;
        const rounds = 4;
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 256;
        document.body.append(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 512, height: 256, dpr: 1 });
        renderer.device.pushErrorScope("validation");

        const batchTextures = [];
        const createTexture = renderer.device.createTexture.bind(
            renderer.device
        );
        renderer.device.createTexture = (descriptor) => {
            const texture = createTexture(descriptor);
            if (descriptor.label === "outline glyph batch") {
                const destroyed = { value: false };
                const destroy = texture.destroy.bind(texture);
                texture.destroy = () => {
                    destroyed.value = true;
                    destroy();
                };
                batchTextures.push(destroyed);
            }
            return texture;
        };
        const font = createSyntheticOutlineFont(glyphsPerRound * rounds);
        const positions = createLabelPositions(labelCount, 512, 256);
        const makeSeries = (uniqueGlyphs, phase) => ({
            text: createSyntheticLabels(labelCount, uniqueGlyphs, 4, phase),
            x: positions.x,
            y: positions.y,
        });
        const initialSeries = makeSeries(glyphsPerRound, 0);
        const mark = renderer.createMark(textMark, {
            font,
            fontSize: 8,
            channels: {
                text: { data: initialSeries.text },
                x: {
                    data: initialSeries.x,
                    type: "f32",
                    scale: identityScale(),
                },
                y: {
                    data: initialSeries.y,
                    type: "f32",
                    scale: identityScale(),
                },
                size: { value: 8 },
                fill: { value: [0.1, 0.2, 0.8, 1] },
            },
        });
        const program = renderer._marks.get(mark.markId);
        const atlas = program._outlineAtlas;
        const firstGlyph = font.getGlyph(String.fromCodePoint(0x100));
        const firstEntry = { ...atlas.ensure([firstGlyph])[0] };
        const snapshots = [];

        const renderAndRecord = async (uniqueGlyphs) => {
            renderer.render({ draws: [{ mark }] });
            await renderer.device.queue.onSubmittedWorkDone();
            // Atlas batch cleanup is queued from completion promises.
            await Promise.resolve();
            snapshots.push({
                uniqueGlyphs,
                entries: atlas.entryCount,
                version: atlas.version,
                width: atlas.width,
                height: atlas.height,
                rebound:
                    program._extraTextures.get("fontAtlas").texture ===
                    atlas.texture,
            });
        };

        await renderAndRecord(glyphsPerRound);
        for (let round = 1; round < rounds; round++) {
            const uniqueGlyphs = glyphsPerRound * (round + 1);
            mark.series.replace(makeSeries(uniqueGlyphs, round), labelCount);
            await renderAndRecord(uniqueGlyphs);
        }

        const stableVersion = atlas.version;
        const stableDimensions = [atlas.width, atlas.height];
        mark.series.replace(
            makeSeries(glyphsPerRound * rounds, rounds + 1),
            labelCount
        );
        await renderAndRecord(glyphsPerRound * rounds);

        const validationError = await renderer.device.popErrorScope();
        const value = {
            snapshots,
            stableVersion,
            stableDimensions,
            finalVersion: atlas.version,
            finalDimensions: [atlas.width, atlas.height],
            finalEntries: atlas.entryCount,
            batchesCreated: batchTextures.length,
            batchesDestroyed: batchTextures.every((batch) => batch.value),
            preservedFirstEntry:
                JSON.stringify(atlas.ensure([firstGlyph])[0]) ===
                JSON.stringify(firstEntry),
            validationError: validationError?.message ?? null,
        };
        renderer.destroy();
        canvas.remove();
        return value;
    });

    expect(result.validationError).toBeNull();
    expect(result.finalEntries).toBe(256);
    expect(result.batchesCreated).toBeGreaterThan(0);
    expect(result.batchesDestroyed).toBe(true);
    expect(result.preservedFirstEntry).toBe(true);
    expect(result.snapshots.every((snapshot) => snapshot.rebound)).toBe(true);
    expect(result.snapshots.map((snapshot) => snapshot.entries)).toEqual([
        64, 128, 192, 256, 256,
    ]);
    expect(result.snapshots[3].version).toBeGreaterThan(
        result.snapshots[0].version
    );
    expect(result.finalVersion).toBe(result.stableVersion);
    expect(result.finalDimensions).toEqual(result.stableDimensions);
});

test("outline text reuses its atlas while replacing twelve thousand labels", async ({
    page,
}) => {
    test.setTimeout(90_000);
    await ensureWebGPU(page);

    const result = await page.evaluate(async () => {
        const [
            { createRenderer },
            { textMark },
            { identityScale },
            {
                createLabelPositions,
                createSyntheticLabels,
                createSyntheticOutlineFont,
            },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/text.js"),
            import("/src/scales/identity.js"),
            import("/tests/fixtures/syntheticOutlineFont.js"),
        ]);

        const labelCount = 12_000;
        const uniqueGlyphs = 32;
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 256;
        document.body.append(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 512, height: 256, dpr: 1 });
        renderer.device.pushErrorScope("validation");
        const font = createSyntheticOutlineFont(uniqueGlyphs);
        const positions = createLabelPositions(labelCount, 512, 256);
        const makeSeries = (phase) => ({
            text: createSyntheticLabels(labelCount, uniqueGlyphs, 6, phase),
            x: positions.x,
            y: positions.y,
        });
        const firstSeries = makeSeries(0);
        const mark = renderer.createMark(textMark, {
            font,
            fontSize: 7,
            channels: {
                text: { data: firstSeries.text },
                x: {
                    data: firstSeries.x,
                    type: "f32",
                    scale: identityScale(),
                },
                y: {
                    data: firstSeries.y,
                    type: "f32",
                    scale: identityScale(),
                },
                size: { value: 7 },
            },
        });
        renderer.render({ draws: [{ mark }] });
        await renderer.device.queue.onSubmittedWorkDone();
        const program = renderer._marks.get(mark.markId);
        const atlas = program._outlineAtlas;
        const before = {
            version: atlas.version,
            width: atlas.width,
            height: atlas.height,
            entries: atlas.entryCount,
        };

        for (let phase = 1; phase <= 3; phase++) {
            mark.series.replace(makeSeries(phase), labelCount);
            renderer.render({ draws: [{ mark }] });
        }
        await renderer.device.queue.onSubmittedWorkDone();
        await Promise.resolve();
        const validationError = await renderer.device.popErrorScope();
        const after = {
            version: atlas.version,
            width: atlas.width,
            height: atlas.height,
            entries: atlas.entryCount,
        };
        renderer.destroy();
        canvas.remove();
        return {
            before,
            after,
            glyphInstancesPerReplacement: labelCount * 6,
            validationError: validationError?.message ?? null,
        };
    });

    expect(result.validationError).toBeNull();
    expect(result.glyphInstancesPerReplacement).toBe(72_000);
    expect(result.before.entries).toBe(32);
    expect(result.after).toEqual(result.before);
});

test("outline aliases share atlas storage while retaining label identity", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const { createRenderer } = await import("/src/index.js");
        const { textMark } = await import("/src/marks/text.js");
        const { identityScale } = await import("/src/scales/identity.js");
        const { loadDefaultFont } = await import("/src/fonts/defaultFont.js");
        const original = await loadDefaultFont();
        const outline = original.getGlyph("H");
        // Fonts can contain distinct glyph IDs with identical outlines and
        // different advances. The generic generator deduplicates exact paths.
        const font = {
            ...original,
            glyphCount: 128,
            getGlyph(character) {
                return {
                    ...outline,
                    glyphId: character.codePointAt(0),
                    advanceWidth:
                        outline.advanceWidth + character.codePointAt(0) * 2,
                };
            },
            getPairAdjustment: () => ({
                firstPlacement: 0,
                firstAdvance: 0,
                secondPlacement: 0,
                secondAdvance: 0,
            }),
        };
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 64;
        document.body.appendChild(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 128, height: 64, dpr: 1 });
        renderer.device.pushErrorScope("validation");
        let batches = 0;
        const createTexture = renderer.device.createTexture.bind(
            renderer.device
        );
        renderer.device.createTexture = (descriptor) => {
            if (descriptor.label == "outline glyph batch") batches++;
            return createTexture(descriptor);
        };
        const create = (text, ids) =>
            renderer.createMark(textMark, {
                font,
                fontSize: 32,
                channels: {
                    text: { data: text },
                    uniqueId: { data: new Uint32Array(ids), type: "u32" },
                    size: { value: 32 },
                    align: { value: 0, type: "u32" },
                    x: {
                        data: new Float32Array([16, 80]),
                        scale: identityScale(),
                        type: "f32",
                    },
                    y: { value: 32, scale: identityScale() },
                    stroke: { value: [0, 0, 1, 1] },
                    strokeWidth: { value: 2 },
                },
            });
        const mark = create(["A", "B"], [11, 12]);
        const atlas = renderer._marks.get(mark.markId)._outlineAtlas;
        const before = {
            version: atlas.version,
            width: atlas.width,
            height: atlas.height,
            entries: atlas.entryCount,
        };
        const hits = async (mark) => {
            renderer.render({ draws: [{ mark }] });
            await renderer.device.queue.onSubmittedWorkDone();
            const ids = [];
            for (const left of [16, 80]) {
                let hit = null;
                for (let y = 24; y < 40 && hit == null; y += 2) {
                    for (let x = left; x < left + 24 && hit == null; x += 2)
                        hit = await renderer.pick(x, y);
                }
                ids.push(hit);
            }
            return ids;
        };
        const initial = await hits(mark);
        mark.series.replace({
            text: ["C", "D"],
            uniqueId: new Uint32Array([13, 14]),
            x: new Float32Array([16, 80]),
        });
        const replaced = await hits(mark);
        const second = create(["E", "F"], [15, 16]);
        const shared = await hits(second);
        const after = {
            version: atlas.version,
            width: atlas.width,
            height: atlas.height,
            entries: atlas.entryCount,
        };
        const validation = await renderer.device.popErrorScope();
        renderer.destroy();
        canvas.remove();
        return {
            initial,
            replaced,
            shared,
            batches,
            before,
            after,
            validation: validation?.message,
        };
    });
    expect(result.validation).toBeUndefined();
    expect(result.initial).toEqual([11, 12]);
    expect(result.replaced).toEqual([13, 14]);
    expect(result.shared).toEqual([15, 16]);
    expect(result.batches).toBe(1);
    expect(result.before.entries).toBe(1);
    expect(result.after).toEqual(result.before);
});
