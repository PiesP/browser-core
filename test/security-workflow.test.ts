import { describe, expect, it } from 'vitest';

import workflow from '../.github/workflows/security.yaml?raw';

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
    expect(workflow).toContain('expect_success "CodeQL" "$CODEQL_RESULT"');
    expect(workflow).toContain('expect_success "Semgrep" "$SEMGREP_RESULT"');
    expect(workflow).toContain('expect_success "OSV full" "$OSV_FULL_RESULT"');
  });

  it('fails closed on scanner execution errors while preserving vulnerability results', () => {
    const scannerSteps = [
      'Scan dependencies before the PR',
      'Scan dependencies after the PR',
      'Run OSV scan',
    ].map(extractStep);

    for (const step of scannerSteps) {
      expect(step).not.toContain('continue-on-error: true');
      expect(step).toContain('scan_status=0');
      expect(step).toContain('|| scan_status=$?');
      expect(step).toContain('if ((scan_status > 1)); then');
      expect(step).toContain('rm -f "$result_path"');
      expect(step).toContain('RESULT_PATH="$result_path" python3 -I - <<\'PY\'');
      expect(step).toContain('object_pairs_hook=reject_duplicate_keys');
      expect(step).toContain('report.get("results")');
    }
  });

  it('fails closed when the pinned reporter cannot parse a result after shallow validation', () => {
    const reporterSteps = [
      'Report newly introduced vulnerabilities',
      'Convert OSV results to SARIF and enforce the vulnerability gate',
    ].map(extractStep);

    for (const step of reporterSteps) {
      expect(step).toContain('--fail-on-vuln=false');
      expect(step).toContain('reporter-validation.log');
      expect(step).toContain("grep -Eq 'failed to (open|parse) (old|new) results at '");
      expect(step).toContain('OSV reporter did not parse its result');
      expect(step).toContain('exit 1');
    }
  });
});
