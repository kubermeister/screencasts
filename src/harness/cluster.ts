// Follows the app's tests/demo/harness/cluster.ts: same image, names, seed and chart, with its own
// container, kubeconfig and state file so a screencast run and a screenshot run never share a cluster.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { K3sContainer } from '@testcontainers/k3s';
import { APP_DIR, CACHE_DIR } from '../config';

/** Keep equal to `K3S_IMAGE` in the app's tests/demo/harness/cluster.ts. */
export const K3S_IMAGE = 'rancher/k3s:v1.36.4-k3s1';
/** Reads as a cluster somebody runs, since the top bar and the dashboard both name it. */
export const CONTEXT_NAME = 'orbit-production';
export const NAMESPACE = 'production';
/** Names the node, which heads the Nodes list, the node page and the drain dialog. */
export const NODE_NAME = 'orbit-node-01';
export const CONTAINER_NAME = 'km-screencasts-cluster';
export const KUBECONFIG_PATH = join(CACHE_DIR, 'kubeconfig');
export const CLUSTER_STATE_PATH = join(CACHE_DIR, 'cluster.json');

/** `KM_SCREENCASTS_FRESH=1` removes the kept cluster and seeds a new one. */
export const FRESH = process.env.KM_SCREENCASTS_FRESH === '1';

export const DEMO_FIXTURES = join(APP_DIR, 'tests/demo/fixtures');
const SEED_PATH = join(DEMO_FIXTURES, 'seed.yaml');
const CUSTOM_SEED_PATH = join(DEMO_FIXTURES, 'seed-custom.yaml');
export const CHART_PATH = join(DEMO_FIXTURES, 'chart');
const RELEASE_NAME = 'platform-agent';
const RELEASE_NAMESPACE = 'platform';

/** The workloads that must be up before filming; the three broken ones never will be, on purpose. */
const HEALTHY: readonly [string, string][] = [
    ['production', 'checkout'],
    ['production', 'payments-api'],
    ['production', 'ingest-worker'],
    ['staging', 'checkout'],
    ['staging', 'payments-api'],
    ['platform', 'search-indexer'],
];

function log(message: string): void {
    console.log(`[cluster] ${message}`);
}

function dockerKubectl(containerId: string, args: string[], input?: string): string {
    // stderr is piped so it lands in the thrown error rather than in the log of every expected retry.
    return execFileSync('docker', ['exec', '-i', containerId, 'kubectl', ...args], {
        encoding: 'utf8',
        input,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
}

function containerId(all = false): string | undefined {
    const id = execFileSync(
        'docker',
        ['ps', ...(all ? ['--all'] : []), '--quiet', '--filter', `name=^/${CONTAINER_NAME}$`],
        { encoding: 'utf8' },
    ).trim();
    return id === '' ? undefined : id;
}

/** Boot and seed the demo cluster, or reuse the kept one. Kept between runs: ages read like a real cluster. */
export async function ensureCluster(): Promise<void> {
    mkdirSync(CACHE_DIR, { recursive: true });
    if (FRESH) {
        removeCluster();
    } else {
        const existing = containerId();
        if (existing && existsSync(KUBECONFIG_PATH)) {
            log(`reusing ${CONTAINER_NAME}; KM_SCREENCASTS_FRESH=1 to start over`);
            writeFileSync(CLUSTER_STATE_PATH, JSON.stringify({ containerId: existing }));
            return;
        }
        // A stopped container or a lost kubeconfig cannot be trusted to hold the seed; start over.
        removeCluster();
    }

    log(`starting ${CONTAINER_NAME} (${K3S_IMAGE})`);
    // Every add-on left on: metrics-server fills the charts and usage meters, traefik gives the
    // cluster an IngressClass, servicelb keeps traefik's Service from sitting Pending. The command
    // is given in full because `K3sContainer` disables traefik by default, and `--node-name`
    // because a k3s node otherwise takes the container's id as its name.
    const started = await new K3sContainer(K3S_IMAGE)
        .withCommand(['server', `--node-name=${NODE_NAME}`])
        .withName(CONTAINER_NAME)
        .withReuse()
        .start();
    const id = started.getId();
    writeFileSync(KUBECONFIG_PATH, started.getKubeConfig().replace(/\bdefault\b/g, CONTEXT_NAME));
    writeFileSync(CLUSTER_STATE_PATH, JSON.stringify({ containerId: id }));

    log('seeding');
    dockerKubectl(id, ['apply', '-f', '-'], readFileSync(SEED_PATH, 'utf8'));
    // A custom resource cannot be created until the API server serves its kind.
    dockerKubectl(id, ['wait', '--for=condition=Established', '--timeout=60s', 'crd/queues.messaging.example.com']);
    dockerKubectl(id, ['apply', '-f', '-'], readFileSync(CUSTOM_SEED_PATH, 'utf8'));

    installRelease();

    for (const [namespace, name] of HEALTHY) {
        try {
            dockerKubectl(id, [
                '-n',
                namespace,
                'wait',
                '--for=condition=Available',
                '--timeout=240s',
                `deployment/${name}`,
            ]);
        } catch {
            console.warn(`[cluster] ${namespace}/${name} did not become available in time; filming anyway`);
        }
    }
    await waitForMetrics(id);
    log(`ready, kubeconfig at ${KUBECONFIG_PATH}`);
}

export function hasHelm(): boolean {
    try {
        execFileSync('helm', ['version', '--short'], { encoding: 'utf8' });
        return true;
    } catch {
        return false;
    }
}

/**
 * A real `helm install` then a real `helm upgrade`, so the release screens read two revisions of
 * bookkeeping Helm itself wrote.
 */
function installRelease(): void {
    if (!hasHelm()) {
        console.warn('[cluster] helm not on PATH: the Helm screens will have no release to show');
        return;
    }
    log(`installing the ${RELEASE_NAME} release`);
    const base = ['--kubeconfig', KUBECONFIG_PATH, '--namespace', RELEASE_NAMESPACE];
    execFileSync('helm', ['install', RELEASE_NAME, CHART_PATH, ...base, '--wait', '--timeout', '3m'], {
        encoding: 'utf8',
    });
    execFileSync(
        'helm',
        [
            'upgrade',
            RELEASE_NAME,
            CHART_PATH,
            ...base,
            '--set',
            'tracing.enabled=true',
            '--set',
            'logLevel=debug',
            '--wait',
            '--timeout',
            '3m',
        ],
        { encoding: 'utf8' },
    );
}

/** metrics-server answers `top` only once it has scraped; until then every usage figure is zero. */
async function waitForMetrics(id: string): Promise<void> {
    log('waiting for metrics');
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
        try {
            dockerKubectl(id, ['top', 'nodes', '--no-headers']);
            return;
        } catch {
            await new Promise((done) => setTimeout(done, 5_000));
        }
    }
    console.warn('[cluster] metrics-server never reported: charts and usage meters will be empty');
}

export function removeCluster(): void {
    if (containerId(true)) {
        execFileSync('docker', ['rm', '--force', CONTAINER_NAME], { stdio: 'ignore' });
        log(`removed ${CONTAINER_NAME}`);
    }
    rmSync(KUBECONFIG_PATH, { force: true });
    rmSync(CLUSTER_STATE_PATH, { force: true });
}

export interface ClusterStatus {
    containerId: string | undefined;
    ready: boolean;
    detail: string;
}

export function clusterStatus(): ClusterStatus {
    const id = containerId();
    if (!id) return { containerId: undefined, ready: false, detail: 'not running' };
    if (!existsSync(KUBECONFIG_PATH)) return { containerId: id, ready: false, detail: 'running, kubeconfig missing' };
    try {
        const nodes = dockerKubectl(id, ['get', 'nodes', '--no-headers']).trim();
        const ready = /\sReady\s/.test(nodes);
        return { containerId: id, ready, detail: nodes };
    } catch (error) {
        return { containerId: id, ready: false, detail: error instanceof Error ? error.message : String(error) };
    }
}

/** Run kubectl inside the demo cluster, e.g. to resolve a pod's generated name or create a rollout. */
export function clusterKubectl(args: string[], input?: string): string {
    const { containerId: id } = JSON.parse(readFileSync(CLUSTER_STATE_PATH, 'utf8')) as { containerId: string };
    return dockerKubectl(id, args, input);
}
