import { describe, expect, it } from 'vitest';
import workflow from '../.github/workflows/notify-consumers.yaml?raw';

describe('consumer notification automation', () => {
  it('validates one revision before dispatching to every consumer', () => {
    expect(workflow.match(/name: Validate commit SHA/g)).toHaveLength(1);
    expect(workflow).toContain('steps.revision.outputs.core_sha');
    expect(workflow).toContain('needs: validate');
    expect(workflow).toContain('needs.validate.outputs.core_sha');
    expect(workflow).toContain('core_sha must be reachable from browser-core master');
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
    expect(workflow).toContain('event_type": "browser-core-updated"');
    expect(workflow).toContain("if: ${{ env.GH_TOKEN != '' }}");
  });
});
