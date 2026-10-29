import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
// No seeded pod has an init container or a sidecar, so the scene brings its own workload and removes it after.
const DEPLOYMENT = 'catalog-sync';
const INIT_CONTAINER = 'schema-check';
const APP_CONTAINER = DEPLOYMENT;

// The app container does a little work on a timer so its CPU usage reads as a figure, not as zero.
const MANIFEST = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${DEPLOYMENT}
  namespace: ${NAMESPACE}
  labels:
    app: ${DEPLOYMENT}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${DEPLOYMENT}
  template:
    metadata:
      labels:
        app: ${DEPLOYMENT}
    spec:
      initContainers:
        - name: ${INIT_CONTAINER}
          image: busybox:1.36
          command: ['sh', '-c', 'echo "schema up to date"']
      containers:
        - name: ${APP_CONTAINER}
          image: busybox:1.36
          command: ['sh', '-c', 'while true; do head -c 2000000 /dev/urandom | md5sum > /dev/null; sleep 0.5; done']
          resources:
            requests:
              cpu: 50m
              memory: 48Mi
            limits:
              cpu: 250m
              memory: 128Mi
        - name: log-shipper
          image: busybox:1.36
          command: ['sh', '-c', 'while true; do sleep 5; done']
          resources:
            requests:
              cpu: 10m
              memory: 32Mi
            limits:
              cpu: 100m
              memory: 64Mi
`;

/** The newest running pod of the deployment: an older one may still be shutting down after a rollout. */
function newestPod(kubectl: (args: string[]) => string): string {
    return kubectl([
        '-n',
        NAMESPACE,
        'get',
        'pods',
        '-l',
        `app=${DEPLOYMENT}`,
        '--field-selector=status.phase=Running',
        '--sort-by=.metadata.creationTimestamp',
        '-o',
        'jsonpath={.items[-1:].metadata.name}',
    ]).trim();
}

export default defineScene({
    async setup({ goto, window, kubectl, focus }) {
        kubectl(['apply', '-f', '-'], MANIFEST);
        kubectl(['-n', NAMESPACE, 'rollout', 'status', `deployment/${DEPLOYMENT}`, '--timeout=180s']);
        await goto(`/workloads/pods/${NAMESPACE}/${newestPod(kubectl)}`);
        const containers = window.getByTestId('pod-page').getByTestId('containers');
        await containers.locator(`[data-container="${INIT_CONTAINER}"]`).waitFor({ timeout: 60_000 });
        // metrics-server reports a new pod only after its next scrape, and the figures are the point.
        await containers
            .locator(`[data-container="${APP_CONTAINER}"] [data-usage="CPU"]`)
            .getByText(/ of /)
            .waitFor({ timeout: 180_000 });
        await focus(containers);
    },
    async run({ window, beat, anchor, glide }) {
        const containers = window.getByTestId('pod-page').getByTestId('containers');
        const appRow = containers.locator(`[data-container="${APP_CONTAINER}"]`);
        // The parent of the CPU row holds both usage rows, CPU and memory, each beside its request.
        const usage = appRow.locator('[data-usage="CPU"]').locator('..');
        anchor(
            'role-badge',
            containers.locator(`[data-container="${INIT_CONTAINER}"]`).getByText('init', { exact: true }),
        );
        anchor('usage', usage);
        await beat('intro');
        await beat('overview', () => glide(containers));
        await beat('role');
        await beat('usage', () => glide(usage));
        await beat('outro');
    },
    async cleanup({ kubectl }) {
        kubectl(['-n', NAMESPACE, 'delete', 'deployment', DEPLOYMENT, '--ignore-not-found']);
    },
});
