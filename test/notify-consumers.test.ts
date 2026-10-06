import { describe, expect, it } from 'vitest';
import workflow from '../.github/workflows/notify-consumers.yaml?raw';

describe('consumer notification automation', () => {
  it('keeps the existing event and permission boundary', () => {
    expect(workflow).toContain('on:\n  push:\n    branches: [master]');
    expect(workflow).toContain('paths-ignore:\n      - "automation/**"');
    expect(workflow).toContain('  workflow_dispatch:\n    inputs:\n      core_sha:');
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).not.toContain('pull_request_target:');
  });

  it('validates one revision before dispatching to every consumer', () => {
    expect(workflow.match(/name: Validate commit SHA/g)).toHaveLength(1);
    expect(workflow).toContain('steps.revision.outputs.core_sha');
    expect(workflow).toContain('needs: validate');
    expect(workflow).toContain('needs.validate.outputs.core_sha');
    expect(workflow).toContain('CORE_SHA: ${{ inputs.core_sha || github.sha }}');
    expect(workflow).toContain('ref: ${{ steps.revision.outputs.core_sha }}');
    expect(workflow).toContain('uses: ./automation/actions/consumer-impact');
    expect(workflow).toContain("base-sha: ${{ github.event.before || '0000000000000000000000000000000000000000' }}");
    expect(workflow).toContain('if: ${{ needs.validate.outputs.impact == \'true\' }}');
  });

  it('keeps dispatch fan-out isolated and resilient', () => {
    for (const repository of [
      'PiesP/wasm-motion-converter',
      'PiesP/xcom-enhanced-gallery',
      'PiesP/yt-live-chat-overlay',
    ]) {
      expect(workflow).toContain(repository);
    }
    expect(workflow).toContain('fail-fast: false');
    expect(workflow).toContain("CONSUMER_UPDATE_TOKEN_CONFIGURED: ${{ secrets.CONSUMER_UPDATE_TOKEN != '' && 'true' || 'false' }}");
    expect(workflow.match(/if: \$\{\{ env\.CONSUMER_UPDATE_TOKEN_CONFIGURED == 'true' \}\}/g)).toHaveLength(3);
    expect(workflow).toContain("if: ${{ env.CONSUMER_UPDATE_TOKEN_CONFIGURED != 'true' }}");
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.CONSUMER_UPDATE_TOKEN }}');
    expect(workflow).toContain('Consumer repositories will discover this commit on their scheduled runs.');
  });

  it('executes only default-branch local code after selecting the pinned runtime', () => {
    const validate = workflow.slice(workflow.indexOf('  validate:'), workflow.indexOf('\n  dispatch:'));
    const dispatch = workflow.slice(workflow.indexOf('  dispatch:'));
    const setup = 'uses: PiesP/browser-core/automation/actions/setup-project@279124fa998847bd0184d2de12bdaadcd6d2f969';
    for (const job of [validate, dispatch]) {
      const checkoutAt = job.indexOf('name: Check out notification workflow source');
      const setupAt = job.indexOf('name: Setup pinned notification runtime');
      const commandAt = job.indexOf('run: node scripts/notify-consumers.ts');
      expect(checkoutAt).toBeGreaterThan(-1);
      expect(setupAt).toBeGreaterThan(checkoutAt);
      expect(commandAt).toBeGreaterThan(setupAt);
      expect(job).toContain('ref: master');
      expect(job).toContain('persist-credentials: false');
      expect(job).toContain(setup);
      expect(job).toContain("install-dependencies: 'false'");
    }
    expect(validate).toContain('run: node scripts/notify-consumers.ts validate');
    expect(dispatch).toContain('run: node scripts/notify-consumers.ts dispatch');
    expect(dispatch.slice(0, dispatch.indexOf('name: Dispatch update event'))).not.toMatch(/^\s+GH_TOKEN:/m);
  });
});
