import { finishWithFfmpeg } from './audio';
import type { Fetch, Finish, VoiceProvider, VoiceSettings } from './provider';

const API = 'https://api.elevenlabs.io/v1/text-to-speech';

export class ElevenLabsProvider implements VoiceProvider {
    readonly id = 'elevenlabs';
    private readonly apiKey: string;
    private readonly fetch: Fetch;
    private readonly finish: Finish;

    constructor({ fetch: fetchImpl = fetch, finish = finishWithFfmpeg }: { fetch?: Fetch; finish?: Finish } = {}) {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set; export it to use the elevenlabs voice provider');
        this.apiKey = apiKey;
        this.fetch = fetchImpl;
        this.finish = finish;
    }

    async synthesize(text: string, settings: VoiceSettings) {
        if (!settings.model)
            throw new Error('The elevenlabs voice provider needs voice.model, e.g. eleven_multilingual_v2');
        // Raw PCM rather than MP3: lossless, at the 24 kHz the voices are made at. 44.1 kHz PCM is
        // refused below the Pro plan, and would only resample the same voice.
        const url = `${API}/${encodeURIComponent(settings.voice)}?output_format=pcm_24000`;
        const response = await this.fetch(url, {
            method: 'POST',
            headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json', accept: 'audio/pcm' },
            body: JSON.stringify({
                text,
                model_id: settings.model,
                ...(settings.speed !== undefined && { voice_settings: { speed: settings.speed } }),
            }),
        });
        if (!response.ok) {
            throw new Error(`ElevenLabs answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
        }
        return this.finish(Buffer.from(await response.arrayBuffer()), 'pcm_s16le_24000');
    }
}
