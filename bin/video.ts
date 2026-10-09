import { parseVideoArgs, USAGE, UsageError, type VideoArgs } from '../src/cli';
import { warnOnOldPlaywright } from '../src/harness/app';
import { runVideo } from '../src/pipeline';

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
    await runVideo(args.id!, args);
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
