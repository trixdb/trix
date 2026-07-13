import { describe, expect, it } from 'vitest';
import { LlmFn, buildSystemPrompt, extractMql, nlToMql } from './nl-to-mql.js';
import { trixMemoryRegistry } from './fields.js';

const reg = trixMemoryRegistry();

/** A scripted LLM: returns queued responses in order, records prompts seen. */
function scriptedLlm(responses: string[]): LlmFn & { prompts: Array<{ system: string; user: string }> } {
  const prompts: Array<{ system: string; user: string }> = [];
  let i = 0;
  const fn = (async (system: string, user: string) => {
    prompts.push({ system, user });
    return responses[Math.min(i++, responses.length - 1)]!;
  }) as LlmFn & { prompts: typeof prompts };
  fn.prompts = prompts;
  return fn;
}

describe('extractMql', () => {
  it('strips code fences, labels, and prose lines', () => {
    expect(extractMql('```mql\nspace:work quality>0.5\n```')).toBe('space:work quality>0.5');
    expect(extractMql('MQL: space:work')).toBe('space:work');
    expect(extractMql('  type:decision  ')).toBe('type:decision');
  });
});

describe('buildSystemPrompt', () => {
  it('is data-driven from the registry (lists real fields + enums)', () => {
    const p = buildSystemPrompt(reg);
    expect(p).toContain('quality');
    expect(p).toContain('event_date');
    expect(p).toContain('work|private|shared|learning'); // origin enum values
    expect(p).toMatch(/Output ONLY the MQL/);
  });
});

describe('nlToMql — happy path', () => {
  it('compiles a valid model response on the first try (0 repairs)', async () => {
    const llm = scriptedLlm(['(entity:"Alice") and quality>=0.7 and created>now-30d']);
    const r = await nlToMql('high quality memories about Alice recently', llm);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.repairs).toBe(0);
      expect(r.value.plan.flatCompatible).toBe(false); // uses quality + entity
      expect(r.value.mql).toContain('quality>=0.7');
    }
  });
});

describe('nlToMql — self-repair loop', () => {
  it('feeds validation errors back and succeeds on the repair attempt', async () => {
    // First response invalid (quality is 0..1), second corrected.
    const llm = scriptedLlm(['quality>5', 'quality>0.5']);
    const r = await nlToMql('very high quality memories', llm, { maxRepairs: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.repairs).toBe(1);
    // The repair prompt must contain the diagnostic.
    expect(llm.prompts[1]!.user).toMatch(/must be between 0 and 1/);
  });

  it('gives up with aggregated errors after maxRepairs', async () => {
    const llm = scriptedLlm(['bogusfield:1']);
    const r = await nlToMql('nonsense', llm, { maxRepairs: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /could not produce valid MQL/.test(e.message))).toBe(true);
  });
});
