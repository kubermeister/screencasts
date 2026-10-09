import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, normalize, sep } from 'node:path';

const TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.wav': 'audio/wav' };

export interface AssetServer {
    url(relativePath: string): string;
    close(): Promise<void>;
}

/**
 * Serves out/ to the renderer for the length of a render, with range requests, so footage and voice
 * lines are read in place rather than copied into the Remotion bundle.
 */
export async function serveDirectory(root: string): Promise<AssetServer> {
    const server: Server = createServer((request, response) => {
        const path = normalize(join(root, decodeURIComponent((request.url ?? '/').split('?')[0]!)));
        if (!path.startsWith(root + sep) || !existsSync(path) || !statSync(path).isFile()) {
            response.writeHead(404).end();
            return;
        }
        const size = statSync(path).size;
        const type = TYPES[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream';
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
        if (range) {
            const start = range[1] ? Number(range[1]) : size - Number(range[2]);
            const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
            response.writeHead(206, {
                'content-type': type,
                'content-length': end - start + 1,
                'content-range': `bytes ${start}-${end}/${size}`,
                'accept-ranges': 'bytes',
            });
            createReadStream(path, { start, end }).pipe(response);
            return;
        }
        response.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
        createReadStream(path).pipe(response);
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return {
        url: (relativePath) => `${base}/${relativePath.split(sep).map(encodeURIComponent).join('/')}`,
        close: () => new Promise((done) => server.close(() => done())),
    };
}
