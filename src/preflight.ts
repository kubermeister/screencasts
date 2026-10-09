import { execFileSync } from 'node:child_process';
import { PreflightError } from './harness/app';

function works(command: string, args: string[]): boolean {
    try {
        execFileSync(command, args, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/** Check 4 of the pre-flight: ffmpeg for audio and encoding, Docker only when recording. */
export function checkTools({ docker }: { docker: boolean }): void {
    if (docker && !works('docker', ['info'])) {
        throw new PreflightError('Docker is not reachable. Start Docker Desktop');
    }
    if (!works('ffmpeg', ['-version']) || !works('ffprobe', ['-version'])) {
        throw new PreflightError('ffmpeg is not on PATH. Install it with `brew install ffmpeg`');
    }
}
