import type { Director } from '../../src/harness/scene';
import { defineScene } from '../../src/harness/scene';

const RELEASE = 'platform-agent';
const NAMESPACE = 'platform';
const CONFIG_MAP = `${RELEASE}-tracing`;

/** The demo chart's tracing config map, as `tests/demo/fixtures/chart/templates/tracing.yaml` renders it. */
const TRACING_CONFIG_MAP = `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${CONFIG_MAP}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: ${RELEASE}
    app.kubernetes.io/instance: ${RELEASE}
    app.kubernetes.io/managed-by: Helm
  annotations:
    meta.helm.sh/release-name: ${RELEASE}
    meta.helm.sh/release-namespace: ${NAMESPACE}
data:
  OTEL_EXPORTER_OTLP_ENDPOINT: "otel-collector.platform:4317"
`;

// The release health only checks the object is present, so putting it back is enough for every other scene.
function restoreConfigMap(kubectl: Director['kubectl']): void {
    kubectl(['apply', '-f', '-'], TRACING_CONFIG_MAP);
}

/** Needs `helm` on PATH: the demo release exists only then. */
export default defineScene({
    async setup({ goto, window, kubectl, focus }) {
        restoreConfigMap(kubectl);
        await goto(`/helm/releases/${NAMESPACE}/${RELEASE}`);
        // Healthy first: a run that was stopped before its cleanup may have left the roll-up Failing.
        await window.locator('[data-testid="release-health"][data-health="Healthy"]').waitFor({ timeout: 60_000 });
        await focus(window.getByTestId('release-page'));
    },
    async run({ window, beat, anchor, kubectl }) {
        const health = window.getByTestId('release-health');
        anchor('release-health', health);
        anchor('worst-object', window.getByTestId('release-resources').locator('[data-worst="true"]'));
        await beat('intro');
        await beat('healthy');
        await beat('missing', async () => {
            kubectl(['-n', NAMESPACE, 'delete', 'configmap', CONFIG_MAP, '--ignore-not-found']);
            // The tab re-reads every 5 s; the roll-up turns Failing once the object is seen missing.
            await window.locator('[data-testid="release-health"][data-health="Failing"]').waitFor({ timeout: 60_000 });
        });
        await beat('failing');
        await beat('outro');
    },
    async cleanup({ kubectl }) {
        restoreConfigMap(kubectl);
    },
});
