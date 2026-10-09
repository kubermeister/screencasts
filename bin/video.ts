import { checkApp, warnOnOldPlaywright } from '../src/harness/app';
import { parseVideoArgs, USAGE, UsageError, type VideoArgs } from '../src/cli';
import { checkTools } from '../src/preflight';
import { record } from '../src/record';
import { loadScript, themeOf } from '../src/script';
import { cachedLines, plannedLines, synthesizeLines } from '../src/voice';

async function timed(id: string, stage: string, work: () => Promise<void>): Promise<void> {
    const started = performance.now();
    try {
        await work();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${id}  ${stage}  failed: ${message}`, { cause: error });
    }
    console.log(`${id}  ${stage}  ${((performance.now() - started) / 1000).toFixed(1)}s`);
}

async function video(id: string, args: VideoArgs): Promise<void> {
    const script = loadScript(id);
    if (args.only === 'render') throw new UsageError('--only render is not implemented yet');
    checkTools({ docker: args.only !== 'voice' });

    if (args.only !== 'record' && script.voice && plannedLines(script).length > 0) {
        await timed(id, 'voice', async () => {
            await synthesizeLines(script, { fresh: args.fresh });
        });
    }
    if (args.only === 'voice') return;

    // Durations decide how long each beat waits, so a recording needs every line measured first.
    const lines = cachedLines(script);
    const missing = plannedLines(script).filter((line) => !lines.has(line.beatId));
    if (missing.length > 0) {
        throw new Error(`${id}  record  needs its voice first: run \`npm run video -- ${id} --only voice\``);
    }
    checkApp(script);
    const voiceMs = new Map([...lines].map(([beatId, line]) => [beatId, line.durationMs]));
    await timed(id, 'record', () => record(script, { theme: args.theme ?? themeOf(script), voiceMs }));
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
    if (args.all) throw new UsageError('--all is not implemented yet');
    await video(args.id!, args);
    return 0;
}

try {
    process.exitCode = await main();
} catch (error) {
    if (error instanceof UsageError) {
        console.error(`${error.message}\n\n${USAGE}`);
        process.exitCode = 2;
    } else {
        // The message names the feature, the stage and, for pre-flight, the fix; the stack is noise
        // unless the harness itself is being debugged.
        console.error(error instanceof Error ? error.message : error);
        if (process.env.KM_SCREENCASTS_DEBUG === '1' && error instanceof Error) console.error(error.stack);
        process.exitCode = 1;
    }
}
