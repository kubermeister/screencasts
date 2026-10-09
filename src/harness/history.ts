// Follows the app's tests/demo/harness/history.ts, reading usage from the screencasts cluster.
import type { ElectronApplication } from 'playwright';
import { clusterKubectl } from './cluster';

/** As many points as the sampler keeps, so a chart is full from the first frame. */
const POINTS = 100;
/** The sampler's cadence, which spaces the points of the one chart that plots against time. */
const SAMPLE_INTERVAL_MS = 12_000;

/** A node's usage now, in percent of what it can allocate, as `kubectl top node` reports it. */
interface NodeUsage {
    name: string;
    cpuPct: number;
    memPct: number;
}

/** What the three series channels answer: the cluster aggregate and each node, in percent. */
export interface ChartHistory {
    aggregate: { nodes: number; cpu: number; mem: number }[];
    nodes: Record<string, { cpu: number[]; mem: number[] }>;
}

function currentUsage(): NodeUsage[] {
    const rows = clusterKubectl(['top', 'node', '--no-headers']).trim().split('\n');
    return rows.map((row) => {
        const [name, , cpu, , mem] = row.trim().split(/\s+/);
        return { name: name!, cpuPct: Number.parseInt(cpu!, 10), memPct: Number.parseInt(mem!, 10) };
    });
}

const clamp = (value: number) => Math.min(99, Math.max(1, Math.round(value)));

/**
 * A series that ends where the cluster is now, so a chart agrees with the figure printed beside it,
 * and has the same shape every run, so two recordings differ only where the cluster does.
 */
function seriesEndingAt(now: number, wave: (i: number) => number): number[] {
    const end = wave(POINTS - 1);
    return Array.from({ length: POINTS }, (_, i) => clamp(now + wave(i) - end));
}

const cpuWave = (i: number) => 6 * Math.sin(i / 7) + 3 * Math.sin(i / 2.3) + 2 * Math.sin(i / 1.3);
const memWave = (i: number) => 1.5 * Math.sin(i / 11);

export function demoHistory(nodes: NodeUsage[] = currentUsage()): ChartHistory {
    const perNode = Object.fromEntries(
        nodes.map((node) => [
            node.name,
            { cpu: seriesEndingAt(node.cpuPct, cpuWave), mem: seriesEndingAt(node.memPct, memWave) },
        ]),
    );
    const series = Object.values(perNode);
    const mean = (values: number[]) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    return {
        aggregate: Array.from({ length: POINTS }, (_, i) => ({
            nodes: nodes.length,
            cpu: mean(series.map((node) => node.cpu[i]!)),
            mem: mean(series.map((node) => node.mem[i]!)),
        })),
        nodes: perNode,
    };
}

/**
 * The sampler starts empty on every launch and reads every 12 s, so filmed charts would be flat
 * lines. The app is left as it ships: the harness replaces the handlers of the three channels the
 * charts read, from outside, through `app.evaluate` and Electron's public `ipcMain`. Every other
 * channel still answers from the cluster. The answer is the app's `{ ok, data }` envelope.
 */
export async function answerChartsWith(app: ElectronApplication, history = demoHistory()): Promise<void> {
    await app.evaluate(
        ({ ipcMain }, { seed, interval }) => {
            const answer = (data: unknown) => ({ ok: true, data });
            const replace = (channel: string, handler: (input: unknown) => unknown) => {
                ipcMain.removeHandler(channel);
                ipcMain.handle(channel, (_event: unknown, input: unknown) => answer(handler(input)));
            };
            replace('metrics.sparklines', () => ({
                nodes: seed.aggregate.map((point) => point.nodes),
                cpu: seed.aggregate.map((point) => point.cpu),
                mem: seed.aggregate.map((point) => point.mem),
            }));
            // Stamped when asked, so the newest point is always now.
            replace('metrics.workloadHealth', () => {
                const now = Date.now();
                return seed.aggregate.map((point, i) => ({
                    t: now - (seed.aggregate.length - 1 - i) * interval,
                    cpu: point.cpu,
                    mem: point.mem,
                }));
            });
            replace('metrics.nodeSeries', (input) => {
                const name = (input as { name?: string } | undefined)?.name ?? '';
                return seed.nodes[name] ?? { cpu: [], mem: [] };
            });
        },
        { seed: history, interval: SAMPLE_INTERVAL_MS },
    );
}
