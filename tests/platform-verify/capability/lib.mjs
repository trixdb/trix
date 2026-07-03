// Shared harness for the capability suite modules.
export const API_URL = process.env.TRIX_API_URL ?? 'https://api.trixdb.com';
export const API_KEY = process.env.TRIX_API_KEY;
export const STAMP = `capsuite-${Date.now().toString(36)}`;

export const results = [];
export const ok = (id, note = '') => results.push({ id, pass: true, note });
export const fail = (id, note) => results.push({ id, pass: false, note });
export const skip = (id, note) => results.push({ id, pass: null, note });

export const state = {
  spaces: [], links: [], memories: [], keys: [], webhooks: [],
  agents: [], tasks: [], goals: [], habits: [],
  projects: [], conversations: [], savedSearches: [], budgets: [],
  skills: [], workflows: [], pipelinePresets: [],
};

export async function api(method, path, body, timeoutMs = 30_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    let json = null;
    try { json = await res.json(); } catch { /* 204 etc. */ }
    return { status: res.status, body: json };
  } finally {
    clearTimeout(t);
  }
}

export async function apiAs(key, method, path, body) {
  const res = await fetch(`${API_URL}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function pollUntil(fn, { timeoutMs = 90_000, everyMs = 3_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await sleep(everyMs);
  }
  return null;
}

export async function makeSpace(tag) {
  const r = await api('POST', 'v1/spaces', { name: `${STAMP}-${tag}`, slug: `${STAMP}-${tag}` });
  if (r.status >= 300) throw new Error(`space create failed: ${r.status} ${JSON.stringify(r.body)}`);
  const id = r.body.id ?? r.body.space?.id;
  state.spaces.push(id);
  return id;
}

export async function remember(content, spaceId) {
  const r = await api('POST', 'v1/memories', { content, space_id: spaceId });
  const id = r.body?.id ?? r.body?.memory?.id;
  if (id) state.memories.push(id);
  return { status: r.status, id, body: r.body };
}

export async function recall(q, extra = '') {
  const r = await api('GET', `v1/search?q=${encodeURIComponent(q)}&limit=10&include=memories${extra}`);
  return r.body?.results ?? [];
}
