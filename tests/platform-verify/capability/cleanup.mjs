import { api, apiAs, ok, fail, skip, state, STAMP, API_URL, makeSpace, remember, recall, pollUntil, sleep } from './lib.mjs';

export async function cleanup() {
  for (const { a, id } of state.links) {
    await api('DELETE', `v1/spaces/${a}/links/${id}`).catch(() => {});
  }
  for (const id of state.memories) {
    await api('DELETE', `v1/memories/${id}`).catch(() => {});
  }
  for (const id of state.spaces) {
    await api('DELETE', `v1/spaces/${id}`).catch(() => {});
  }
  for (const [kind, path] of [
    ['webhooks', 'v1/webhooks'],
    ['agents', 'v1/agents'],
    ['tasks', 'v1/tasks'],
    ['goals', 'v1/goals'],
    ['habits', 'v1/habits'],
    ['notes', 'v1/notes'], // notes.space_id is SET NULL on space delete — no cascade
    ['keys', 'v1/accounts/api-keys'],
  ]) {
    for (const id of state[kind]) {
      await api('DELETE', `${path}/${id}`).catch(() => {});
    }
  }
  // Semantic search returns nearest-neighbors even for garbage queries, so
  // only rows whose CONTENT actually carries the stamp count as leftovers.
  const leftovers = (await recall(STAMP)).filter((r) => (r.content ?? '').includes(STAMP));
  if (leftovers.length > 0) {
    console.error(`CLEANUP WARNING: ${leftovers.length} stamped memories still searchable`);
  }
}
