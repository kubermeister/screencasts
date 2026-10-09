import { checkApp, warnOnOldPlaywright } from '../src/harness/app';
import { parseVideoArgs, USAGE, UsageError, type VideoArgs } from '../src/cli';
import { checkTools } from '../src/preflight';
import { record } from '../src/record';
import { loadScript, themeOf } from '../src/script';

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
    if (args.only && args.only !== 'record') {
        throw new UsageError(`--only ${args.only} is not implemented yet`);
    }
    checkApp(script);
    checkTools();
    await timed(id, 'record', () => record(script, { theme: args.theme ?? themeOf(script), voiceMs: new Map() }));
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
