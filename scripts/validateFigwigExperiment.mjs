import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { FigWig } from "@genome-spy/figwig";
import { LocalFile } from "generic-filehandle2";

/**
 * @typedef {object} ReferenceCase
 * @property {string} chromosome
 * @property {number} start
 * @property {number} end
 * @property {number} binSize
 * @property {string} reason
 * @property {(number | null)[][]} expected
 */

const [, , file, referenceFile, reportFile] = process.argv;
if (!file || !referenceFile || process.argv.length > 5) {
    throw new Error(
        "Usage: node scripts/validateFigwigExperiment.mjs signals.fw reference.json [report.json]"
    );
}

/** @type {{samples: string[], tolerance: {absolute: number, relative: number}, cases: ReferenceCase[]}} */
const reference = JSON.parse(readFileSync(referenceFile, "utf8"));
const reader = new FigWig({ filehandle: new LocalFile(file) });
const started = performance.now();
let finiteValues = 0;
let missingValues = 0;
let zeroValues = 0;
let maxAbsoluteError = 0;
let maxRelativeError = 0;

try {
    assert.deepEqual(
        (await reader.getTracks()).map((track) => track.name),
        reference.samples,
        "Track identity and ordering must match samples.tsv"
    );

    const binSizes = new Set(reference.cases.map((test) => test.binSize));
    for (const binSize of binSizes) {
        const cases = reference.cases.filter(
            (test) => test.binSize === binSize
        );
        const results = await reader.getBinsMulti(cases, {
            tracks: reference.samples,
            binSize,
            aggregation: "mean",
            missing: "omit",
            useSummaries: false,
        });

        for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
            const test = cases[caseIndex];
            const result = results[caseIndex];
            assert.equal(result.source, "values");
            assert.equal(result.tracks.length, reference.samples.length);

            for (
                let trackIndex = 0;
                trackIndex < result.tracks.length;
                trackIndex++
            ) {
                const track = result.tracks[trackIndex];
                assert.equal(track.track.name, reference.samples[trackIndex]);
                const expected = test.expected[trackIndex];
                assert.equal(track.values.length, expected.length);

                for (let bin = 0; bin < expected.length; bin++) {
                    const start = test.start + bin * binSize;
                    const end = Math.min(test.end, start + binSize);
                    assert.equal(result.starts[bin], start);
                    assert.equal(result.ends[bin], end);

                    const actual = track.values[bin];
                    const wanted = expected[bin];
                    const label = `${test.reason}: ${test.chromosome}:${start}-${end}, ${track.track.name}`;
                    if (wanted === null) {
                        assert(
                            Number.isNaN(actual),
                            label + " must be missing"
                        );
                        missingValues++;
                    } else {
                        assert(
                            Number.isFinite(actual),
                            label + " must be finite"
                        );
                        const error = Math.abs(actual - wanted);
                        const tolerance =
                            reference.tolerance.absolute +
                            reference.tolerance.relative * Math.abs(wanted);
                        assert(
                            error <= tolerance,
                            `${label}: expected ${wanted}, got ${actual}, tolerance ${tolerance}`
                        );
                        maxAbsoluteError = Math.max(maxAbsoluteError, error);
                        if (wanted !== 0) {
                            maxRelativeError = Math.max(
                                maxRelativeError,
                                error / Math.abs(wanted)
                            );
                        } else {
                            zeroValues++;
                        }
                        finiteValues++;
                    }
                }
            }
        }
    }

    assert(finiteValues > 0 && missingValues > 0 && zeroValues > 0);
    const report = {
        tracks: reference.samples.length,
        cases: reference.cases.length,
        chromosomes: Array.from(
            new Set(reference.cases.map((test) => test.chromosome))
        ),
        finiteValues,
        missingValues,
        zeroValues,
        maxAbsoluteError,
        maxRelativeError,
        tolerance: reference.tolerance,
        elapsedMs: performance.now() - started,
        diagnostics: reader.getDiagnostics(),
    };
    const json = JSON.stringify(report, null, 2) + "\n";
    if (reportFile) writeFileSync(reportFile, json);
    process.stdout.write(json);
} finally {
    await reader.close();
}
