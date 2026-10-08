import { describe, expect, it } from 'vitest';

import workflow from '../.github/workflows/security.yaml?raw';
import settings from '../.github/settings.yml?raw';

const trustedSha = 'e80334d25dd4edb18703d63153ef7630daf4d04b';
const helper = '"$RUNNER_TEMP/trusted-helper/scripts/security/osv-workflow.ts"';

describe('security workflow', () => {
  function extractStep(name: string): string {
    const lines = workflow.split('\n');
    const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
    if (start < 0) throw new Error(`Workflow step not found: ${name}`);

    const indent = lines[start]?.match(/^\s*/)?.[0].length ?? 0;
    let end = start + 1;
    while (end < lines.length) {
      const line = lines[end] ?? '';
      const lineIndent = line.match(/^\s*/)?.[0].length ?? 0;
      if (line.trim() && lineIndent === indent && line.trim().startsWith('- name: ')) break;
      if (line.trim() && lineIndent < indent) break;
      end += 1;
    }

    return lines.slice(start, end).join('\n');
  }

  it('runs full security scans after changes land on master', () => {
    expect(workflow).toContain('push:\n    branches: [master]');
    expect(workflow).toContain(
      "github.event_name == 'push' || github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'",
    );
    expect(workflow).toContain(
      "github.event_name == 'push' || github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' || github.event_name == 'pull_request'",
    );
  });

  it('requires every event-specific scan through a summary gate', () => {
    expect(workflow).toContain('security-summary:');
    expect(workflow).toContain('needs: [osv-scan-pr, osv-scan-full, codeql, semgrep]');
    expect(extractStep('Summarize and validate event-specific scans')).toContain(`run: node ${helper} summary`);
    expect(workflow).toContain('CODEQL_RESULT: ${{ needs.codeql.result }}');
    expect(workflow).toContain('SEMGREP_RESULT: ${{ needs.semgrep.result }}');
    expect(workflow).toContain('OSV_FULL_RESULT: ${{ needs.osv-scan-full.result }}');
  });

  it('binds the emitted aggregate and every existing required check to GitHub Actions', () => {
    const summaryName = workflow.match(/  security-summary:\n    name: ([^\n]+)/)?.[1];
    expect(summaryName).toBe('Security scan summary');
    const requirements = settings.split('      required_status_checks:')[1]?.split('      enforce_admins:')[0] ?? '';
    const checks = [...requirements.matchAll(/- context: "([^"\n]+)"\n\s+app_id: (\d+)/g)]
      .map(match => ({ context: match[1], app: Number(match[2]) }));
    expect(checks).toEqual([
      { context: 'quality', app: 15368 },
      { context: 'OSV Vulnerability Scan (PR Diff)', app: 15368 },
      { context: 'Static Analysis (Semgrep)', app: 15368 },
      { context: summaryName, app: 15368 },
    ]);
    expect(requirements).toContain('strict: true');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('    if: ${{ always() }}');
  });

  it('materializes the complete reviewed helper outside the checkout in every caller', () => {
    const bootstrapSteps = workflow.split('      - name: Materialize immutable OSV helper outside the checkout');
    expect(bootstrapSteps).toHaveLength(4);
    for (const block of bootstrapSteps.slice(1)) {
      const bootstrap = block.split('\n      - name: ')[0] ?? '';
      expect(bootstrap).toContain(`TRUSTED_HELPER_SHA: ${trustedSha}`);
      expect(bootstrap).toContain('umask 077');
      expect(bootstrap).toContain('helper_root="$RUNNER_TEMP/trusted-helper"');
      expect(bootstrap).toContain('mkdir -m 0700 "$helper_root"');
      expect(bootstrap).toContain('git cat-file -e "$TRUSTED_HELPER_SHA^{commit}"');
      expect(bootstrap).toContain('git show "$TRUSTED_HELPER_SHA:$helper" > "$helper_root/$helper"');
      for (const path of [
        'scripts/security/osv-workflow.ts',
        'automation/security/strict-json.ts',
        'automation/security/osv-report.ts',
        'automation/security/validate-osv.ts',
      ]) expect(bootstrap).toContain(path);
      expect(bootstrap).not.toContain('GITHUB_WORKSPACE');
    }
  });

  it('sets the trusted runtime before TypeScript and keeps scan order and SARIF uploads', () => {
    const setup = 'uses: PiesP/browser-core/automation/actions/setup-project@279124fa998847bd0184d2de12bdaadcd6d2f969';
    expect(workflow.split(setup)).toHaveLength(4);
    expect(workflow.split("install-dependencies: 'false'")).toHaveLength(4);
    expect(workflow.indexOf('git switch --force --detach "$BASE_SHA"'))
      .toBeLessThan(workflow.indexOf('Setup trusted Node runtime'));
    expect(workflow.indexOf('Setup trusted Node runtime'))
      .toBeLessThan(workflow.indexOf('Materialize immutable OSV helper'));
    expect(workflow.indexOf('Scan dependencies before the PR'))
      .toBeLessThan(workflow.indexOf('git switch --force --detach "$GITHUB_SHA"'));
    expect(workflow.indexOf('git switch --force --detach "$GITHUB_SHA"'))
      .toBeLessThan(workflow.indexOf('Scan dependencies after the PR'));
    expect(extractStep('Scan dependencies before the PR')).toContain(`run: node ${helper} scan-old`);
    expect(extractStep('Scan dependencies after the PR')).toContain(`run: node ${helper} scan-new`);
    expect(extractStep('Run OSV scan')).toContain(`run: node ${helper} scan-full`);
    expect(extractStep('Report newly introduced vulnerabilities')).toContain(`run: node ${helper} report-pr`);
    expect(extractStep('Convert OSV results to SARIF and enforce the vulnerability gate'))
      .toContain(`run: node ${helper} report-full`);
    expect(extractStep('Checkout immutable security helper manifest')).toContain(`ref: ${trustedSha}`);
    expect(workflow.split('fetch-depth: 0')).toHaveLength(3);
    expect(workflow.split('sarif_file: ${{ runner.temp }}/osv-results/osv-results.sarif'))
      .toHaveLength(3);
    for (const name of ['Scan dependencies before the PR', 'Scan dependencies after the PR', 'Run OSV scan']) {
      expect(extractStep(name)).not.toContain('continue-on-error: true');
    }
  });

  it('keeps workflow scan and summary policy in the trusted TypeScript CLI', () => {
    expect(workflow).not.toContain('python3 -I');
    expect(workflow).not.toContain('scan_status=');
    expect(workflow).not.toContain('validation_status=');
    expect(workflow).not.toContain('expect_success()');
    expect(workflow).toContain('needs: [osv-scan-pr, osv-scan-full, codeql, semgrep]');
    expect(workflow).toContain('queries: security-extended');
    expect(workflow).toContain('semgrep scan \\');
  });
});
