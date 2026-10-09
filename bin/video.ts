// First: everything after it may read process.env as it loads.
import '../src/env';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseVideoArgs, USAGE, UsageError, type VideoArgs } from '../src/cli';
import { OUT_DIR } from '../src/config';
import { warnOnOldPlaywright } from '../src/harness/app';
import { compareVideo, runVideo } from '../src/pipeline';
import { allVideoIds } from '../src/script';

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Every video, one after another; a failure is reported and the rest still run. */
async function all(args: VideoArgs): Promise<number> {
    const ids = allVideoIds();
    const results: { id: string; error?: string; seconds: number }[] = [];
    for (const id of ids) {
        const started = performance.now();
        try {
            await (args.compare ? compareVideo(id, args) : runVideo(id, args));
            if (args.open) openOutputs(id);
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

/** Opens what the run produced with macOS `open`; the outputs of a skipped stage are opened too. */
function openOutputs(id: string): void {
    const dir = join(OUT_DIR, id);
    const files = [`${id}-video.mp4`, `${id}-reel.mp4`]
        .map((file) => join(dir, file))
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
    await (args.compare ? compareVideo(args.id!, args) : runVideo(args.id!, args));
    if (args.open) openOutputs(args.id!);
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
