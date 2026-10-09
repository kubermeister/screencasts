import { clusterStatus, CONTAINER_NAME, ensureCluster, KUBECONFIG_PATH, removeCluster } from '../src/harness/cluster';

const USAGE = 'Usage: npm run cluster -- up|down|status';

async function main(command: string | undefined): Promise<number> {
    switch (command) {
        case 'up':
            await ensureCluster();
            return 0;
        case 'down':
            removeCluster();
            return 0;
        case 'status': {
            const status = clusterStatus();
            console.log(`container  ${status.containerId ?? '-'} (${CONTAINER_NAME})`);
            console.log(`ready      ${status.ready ? 'yes' : 'no'}`);
            console.log(`kubeconfig ${KUBECONFIG_PATH}`);
            console.log(status.detail);
            return status.ready ? 0 : 1;
        }
        default:
            console.error(USAGE);
            return 2;
    }
}

try {
    process.exitCode = await main(process.argv[2]);
} catch (error) {
    console.error(`cluster: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}
