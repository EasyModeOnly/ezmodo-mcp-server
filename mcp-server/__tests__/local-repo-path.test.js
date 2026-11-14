import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { localRepoPath } from '../lib/local-repo-path.js';

// cwd → repo-relative path for get_design_system (E-328 #3694), against real
// temporary git repositories.
describe('localRepoPath', () => {
  let repo;
  let outside;

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ezmodo-repo-path-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    fs.mkdirSync(path.join(repo, 'web', 'src', 'components'), { recursive: true });
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ezmodo-no-repo-'));
  });

  afterAll(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('gives a subdirectory relative to the git root, with forward slashes', () => {
    expect(localRepoPath(path.join(repo, 'web', 'src', 'components'))).toBe('web/src/components');
  });

  it('gives nothing at the repository root', () => {
    expect(localRepoPath(repo)).toBeUndefined();
  });

  it('gives nothing outside a git checkout', () => {
    expect(localRepoPath(outside)).toBeUndefined();
  });
});
