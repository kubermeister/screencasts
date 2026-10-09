// First: everything after it may read process.env as it loads.
import '../src/env';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { parseVideoArgs, USAGE, UsageError, type VideoArgs } from '../src/cli';
import { confirmAll } from '../src/confirm';
import { warnOnOldPlaywright } from '../src/harness/app';
import { compareVideo, listVariants, removeVariant, runVideo } from '../src/pipeline';
import { variantFiles, type Variant } from '../src/variant';
import { allVideoIds } from '../src/script';

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Every video, one after another; a failure is reported and the rest still run. */
async function all(args: VideoArgs): Promise<number> {
    const ids = allVideoIds();
    // Listing is harmless; rendering everything is long and can spend paid voice credits.
    if (!args.variants) await confirmAll(ids, args);
    const results: { id: string; error?: string; seconds: number }[] = [];
    for (const id of ids) {
        const started = performance.now();
        try {
            if (args.variants) await listVariants(id, args);
            else {
                const variants = await (args.compare ? compareVideo(id, args) : runVideo(id, args));
                if (args.open) openOutputs(variants);
            }
            results.push({ id, seconds: (performance.now() - started) / 1000 });
        } catch (error) {
            console.error(errorMessage(error));
            results.push({ id, error: errorMessage(error), seconds: (performance.now() - started) / 1000 });
        }
    }
    const failed = results.filter((result) => result.error);
    console.log(`\n${ids.length - failed.length} of ${ids.length} videos done`);
    for (const result of results) {
        console.log(`  ${result.error ? 'FAIL' : 'ok  '}  ${result.id.padEnd(24)} ${result.seconds.toFixed(1)}s`);
    }
    return failed.length > 0 ? 1 : 0;
}

/** Opens what the run covered with macOS `open`; the outputs of a skipped stage are opened too. */
function openOutputs(variants: Variant[]): void {
    const files = variants
        .flatMap((variant) => (['video', 'reel'] as const).map((format) => variantFiles(variant).video(format)))
        .filter((file) => existsSync(file));
    if (files.length > 0) execFileSync('open', files);
}

async function main(): Promise<number> {
    let args: VideoArgs;
    try {
        args = parseVideoArgs(process.argv.slice(2));
    } catch (error) {
        if (!(error instanceof UsageError)) throw error;
        console.error(`${error.message}\n\n${USAGE}`);
        return 2;
    }
    warnOnOldPlaywright();
    if (args.all) return all(args);
    const id = args.id!;
    if (args.remove !== undefined) removeVariant(id, args.remove);
    else if (args.variants) await listVariants(id, args);
    else {
        const variants = await (args.compare ? compareVideo(id, args) : runVideo(id, args));
        if (args.open) openOutputs(variants);
    }
    return 0;
}

try {
    process.exitCode = await main();
} catch (error) {
    if (error instanceof UsageError) {
        console.error(`${error.message}\n\n${USAGE}`);
        process.exitCode = 2;
    } else {
        // The message names the video, the stage and, for pre-flight, the fix; the stack is noise
        // unless the harness itself is being debugged.
        console.error(error instanceof Error ? error.message : error);
        if (process.env.KM_SCREENCASTS_DEBUG === '1' && error instanceof Error) console.error(error.stack);
        process.exitCode = 1;
    }
}
