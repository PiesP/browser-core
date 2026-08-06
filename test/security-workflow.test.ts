import { describe, expect, it } from 'vitest';

import workflow from '../.github/workflows/security.yaml?raw';

describe('security workflow', () => {
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
});
