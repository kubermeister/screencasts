import OpenAI from 'openai';
import { finishWithFfmpeg } from './audio';
import type { Fetch, Finish, VoiceProvider, VoiceSettings } from './provider';

export class OpenAIProvider implements VoiceProvider {
    readonly id = 'openai';
    private readonly client: OpenAI;
    private readonly finish: Finish;

    constructor({ fetch, finish = finishWithFfmpeg }: { fetch?: Fetch; finish?: Finish } = {}) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY is not set; export it to use the openai voice provider');
        this.client = new OpenAI({ apiKey, ...(fetch && { fetch }) });
        this.finish = finish;
    }

    async synthesize(text: string, settings: VoiceSettings) {
        if (!settings.model) throw new Error('The openai voice provider needs voice.model, e.g. gpt-4o-mini-tts');
        const response = await this.client.audio.speech.create({
            model: settings.model,
            voice: settings.voice,
            input: text,
            ...(settings.instructions && { instructions: settings.instructions }),
            ...(settings.speed !== undefined && { speed: settings.speed }),
            response_format: 'wav',
        });
        return this.finish(Buffer.from(await response.arrayBuffer()), 'wav');
    }
}
