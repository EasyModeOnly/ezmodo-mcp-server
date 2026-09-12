import { existsSync, readFileSync } from 'fs';
import { getInstructions } from '../lib/instructions.js';
import { WORK_TRACKING_CORE, WORK_TRACKING_LOCAL } from '../lib/instructions.generated.js';
import { extract, SKILL_PATH } from '../scripts/build-instructions.mjs';

describe('drift guard', () => {
  // The skill lives in the plugin, a different artifact. It is present in the
  // repo and absent from a published `npx @ezmodo/mcp-server` install, so this
  // check runs exactly where it can and skips where it cannot.
  const haveSkill = existsSync(SKILL_PATH);
  const whenAvailable = haveSkill ? it : it.skip;

  whenAvailable('matches the work-tracking skill it was generated from', () => {
    // If this fails, the SKILL changed and nobody regenerated. Run:
    //   npm run generate:instructions --workspace=@ezmodo/mcp-server
    const skill = readFileSync(SKILL_PATH, 'utf-8');
    expect(WORK_TRACKING_CORE).toBe(extract(skill, 'core'));
    expect(WORK_TRACKING_LOCAL).toBe(extract(skill, 'local'));
  });

  whenAvailable('refuses to generate from a skill with no markers', () => {
    // A silently empty instructions string would ship a server that says
    // nothing and looks fine.
    expect(() => extract('# A skill with no markers', 'core')).toThrow(/mcp:core/);
  });
});

describe('surface', () => {
  it('gives the local surface the commit-linking rules', () => {
    const local = getInstructions('local');
    expect(local).toContain('link_commit');
    expect(local).toContain('changedFiles');
  });

  it('withholds them from the remote surface', () => {
    // The connector serves no local-machine tools, so this advice is one an
    // agent cannot follow — worse than silence, because trying produces a
    // failure the user cannot act on.
    const remote = getInstructions('remote');
    expect(remote).not.toContain('link_commit');
    expect(remote).not.toContain('git rev-parse');
  });

  it('gives BOTH surfaces the core contract', () => {
    for (const surface of ['local', 'remote']) {
      const text = getInstructions(surface);
      expect(text).toContain('get_current_project_context');
      expect(text).toContain('report_untracked_work');
      expect(text).toContain('in_review');
    }
  });

  it('defaults to the local surface', () => {
    expect(getInstructions()).toBe(getInstructions('local'));
  });
});

describe('size', () => {
  it('stays small enough to pay for on every session', () => {
    // A skill is loaded on demand and can afford hundreds of lines; this is
    // charged to every session on every client. Roughly a page, not a manual.
    expect(getInstructions('local').length).toBeLessThan(6000);
  });
});
