import type { KokoroTTS } from 'kokoro-js';
import { finishWithFfmpeg } from './audio';
import type { Finish, VoiceProvider } from './provider';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

type KokoroVoice = NonNullable<Parameters<KokoroTTS['generate']>[1]>['voice'];

/** Local text to speech: nothing leaves the machine and nothing needs a key. */
export class KokoroProvider implements VoiceProvider {
    readonly id = 'kokoro';
    private model: Promise<KokoroTTS> | undefined;

    constructor(private readonly finish: Finish = finishWithFfmpeg) {}

    private load(): Promise<KokoroTTS> {
        this.model ??= (async () => {
            console.log(`[voice] loading ${MODEL_ID} (q8, CPU); the first run downloads it into the library's cache`);
            // Imported on first use: the model runtime is heavy and most runs synthesize nothing.
            const { KokoroTTS } = await import('kokoro-js');
            return KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'cpu' });
        })();
        return this.model;
    }

    async synthesize(text: string, settings: { voice: string; speed?: number }) {
        const model = await this.load();
        if (!(settings.voice in model.voices)) {
            throw new Error(
                `Kokoro has no voice '${settings.voice}'; try one of ${Object.keys(model.voices).join(', ')}`,
            );
        }
        const audio = await model.generate(text, { voice: settings.voice as KokoroVoice, speed: settings.speed ?? 1 });
        return this.finish(Buffer.from(audio.toWav()), 'wav');
    }
}
