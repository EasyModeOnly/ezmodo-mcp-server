import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { listPrompts, getPromptContent } from '../prompts/index.js';
import { COMMAND_PROMPTS } from '../prompts/commands.generated.js';
import {
  COMMANDS,
  COMMANDS_DIR,
  parseCommand,
  stripShellInterpolation,
  retargetSkillReferences,
} from '../scripts/build-prompts.mjs';

describe('drift guard', () => {
  // plugins/ is a different artifact and is absent from a published npx
  // install, so this runs where it can and skips where it cannot.
  const whenAvailable = existsSync(COMMANDS_DIR) ? it : it.skip;

  whenAvailable('matches the plugin commands it was generated from', () => {
    // Failing here means a command changed and nobody regenerated. Run:
    //   npm run generate:prompts --workspace=@ezmodo/mcp-server
    for (const { file, name } of COMMANDS) {
      const { description, body } = parseCommand(readFileSync(join(COMMANDS_DIR, file), 'utf-8'));
      const generated = COMMAND_PROMPTS.find((p) => p.name === name);
      expect(generated.description).toBe(description);
      expect(generated.body).toBe(retargetSkillReferences(stripShellInterpolation(body)));
    }
  });
});

describe('shell interpolation', () => {
  it('never reaches a prompt body', () => {
    // Claude Code runs !`cmd` before the model sees it. MCP has no such
    // preprocessor, so the raw syntax would arrive as literal text and be read
    // as though it were a command result.
    for (const prompt of COMMAND_PROMPTS) {
      expect(prompt.body).not.toMatch(/!`/);
    }
  });

  it('rewrites it into something the agent can act on', () => {
    expect(stripShellInterpolation('HEAD: !`git rev-parse HEAD`')).toBe(
      'HEAD: run `git rev-parse HEAD` and use its output'
    );
  });
});

describe('skill references', () => {
  it('never points an MCP client at a Claude Code skill', () => {
    // There are no skills outside Claude Code, so the reference would be an
    // instruction the client cannot carry out.
    for (const prompt of COMMAND_PROMPTS) {
      expect(prompt.body).not.toMatch(/skill/i);
    }
  });

  it('repoints work-tracking at the instructions, which every client DOES get', () => {
    expect(retargetSkillReferences('Follow the **EzModo Work Tracking** skill.')).toBe(
      "Follow the work-tracking contract in this server's instructions."
    );
  });

  it('matches a reference straddling a line break', () => {
    // These bodies are hard-wrapped markdown, so a space-literal pattern would
    // silently miss exactly the wrapped ones.
    expect(retargetSkillReferences('following the **EzModo Work Tracking**\nskill for the rest.'))
      .toBe("following the work-tracking contract in this server's instructions for the rest.");
  });

  it('drops a reference to a skill with no MCP equivalent', () => {
    expect(retargetSkillReferences('Clear the queue. See the **EzModo Link Upkeep** skill.')).toBe(
      'Clear the queue.'
    );
  });
});

describe('surface filtering', () => {
  it('serves the four commands locally', () => {
    expect(listPrompts('local').map((p) => p.name).sort()).toEqual([
      'resume',
      'start',
      'submit',
      'untracked',
    ]);
  });

  it('withholds submit remotely — it reads git SHAs and links commits', () => {
    expect(listPrompts('remote').map((p) => p.name)).not.toContain('submit');
  });

  it('refuses a prompt it holds but does not serve on this surface', () => {
    // Absent, not refused-with-a-different-message: telling a caller a prompt
    // exists and then declining it is worse than it simply not being there.
    expect(getPromptContent('submit', {}, 'remote')).toBeNull();
    expect(getPromptContent('submit', {}, 'local')).toBeTruthy();
  });

  it('returns null for a name that never existed', () => {
    expect(getPromptContent('nope', {}, 'local')).toBeNull();
  });
});

describe('arguments', () => {
  it('substitutes the user argument into the body', () => {
    const content = getPromptContent('start', { arguments: 'add a rate limiter' }, 'local');
    expect(content).toContain('add a rate limiter');
    expect(content).not.toContain('$ARGUMENTS');
  });

  it('leaves no placeholder behind when nothing is supplied', () => {
    // submit and untracked are perfectly usable with nothing to add.
    expect(getPromptContent('submit', {}, 'local')).not.toContain('$ARGUMENTS');
  });

  it('never marks the argument required', () => {
    // A required argument makes a client refuse to run the prompt at all.
    for (const prompt of listPrompts('local')) {
      for (const argument of prompt.arguments) {
        expect(argument.required).toBe(false);
      }
    }
  });
});

describe('the retired prompts', () => {
  it('no longer serves anything named for the pre-rebrand product', () => {
    for (const prompt of listPrompts('local')) {
      expect(prompt.name).not.toMatch(/zephly/i);
      expect(prompt.description).not.toMatch(/zephly/i);
    }
  });

  it('names no tool the server does not actually have', async () => {
    // The retired prompts told agents to open a session with
    // list_organizations() and list_projects(), neither of which exists.
    const { TOOLS } = await import('../tools/index.js');
    const names = new Set(TOOLS.map((t) => t.name));
    const called = new Set();
    for (const prompt of COMMAND_PROMPTS) {
      for (const [, tool] of prompt.body.matchAll(/`([a-z_]+)\s*(?:action:|\()/g)) {
        called.add(tool);
      }
    }
    expect(called.size).toBeGreaterThan(0);
    for (const tool of called) {
      expect(names.has(tool)).toBe(true);
    }
  });
});
