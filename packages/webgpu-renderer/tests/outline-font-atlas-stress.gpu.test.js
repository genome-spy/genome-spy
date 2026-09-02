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
        const firstPath = font.getGlyph(String.fromCodePoint(0x100)).path;
        const firstEntry = { ...atlas.ensure([firstPath])[0] };
        const snapshots = [];

        const renderAndRecord = async (uniqueGlyphs) => {
            renderer.render({ draws: [{ mark }] });
            await renderer.device.queue.onSubmittedWorkDone();
            // Atlas batch cleanup is queued from completion promises.
            await Promise.resolve();
            snapshots.push({
                uniqueGlyphs,
                entries: atlas._entryByPath.size,
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
            finalEntries: atlas._entryByPath.size,
            pendingBatches: atlas._pendingBatches.size,
            preservedFirstEntry:
                JSON.stringify(atlas.ensure([firstPath])[0]) ===
                JSON.stringify(firstEntry),
            validationError: validationError?.message ?? null,
        };
        renderer.destroy();
        canvas.remove();
        return value;
    });

    expect(result.validationError).toBeNull();
    expect(result.finalEntries).toBe(256);
    expect(result.pendingBatches).toBe(0);
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
            entries: atlas._entryByPath.size,
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
            entries: atlas._entryByPath.size,
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
