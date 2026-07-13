import {
  BOOL_OPS,
  DATE_OPS,
  EQUALITY_OPS,
  FieldRegistry,
  NUMBER_OPS,
} from './field-registry.js';
import type { DynamicNamespace, FieldDef } from './field-registry.js';

/**
 * The Trix memory field catalogue — the queryable surface of MQL, derived from
 * the real `memories` schema (migrations/) and the `listMemoriesSchema` filter
 * set. `target` is the canonical column the compiler emits. Adding a field here
 * is the ONLY change needed to make a new memory attribute queryable.
 */
const TEXT_OPS = EQUALITY_OPS;

const FIELDS: readonly FieldDef[] = [
  // --- tenancy / organisation ---
  { name: 'space', aliases: ['space_id'], type: 'id', ops: TEXT_OPS, target: 'space_id', description: 'Space the memory belongs to' },
  { name: 'session', aliases: ['session_id'], type: 'id', ops: TEXT_OPS, target: 'session_id' },
  { name: 'cluster', aliases: ['cluster_id'], type: 'id', ops: TEXT_OPS, target: 'cluster_id' },
  { name: 'type', aliases: ['memory_type', 'kind'], type: 'text', ops: TEXT_OPS, target: 'memory_type', description: 'Semantic memory type (decision, note, fact, ...)' },
  { name: 'content_type', aliases: ['mime'], type: 'text', ops: TEXT_OPS, target: 'content_type' },
  { name: 'origin', aliases: ['origin_type'], type: 'enum', ops: TEXT_OPS, enumValues: ['work', 'private', 'shared', 'learning'], target: 'origin_type' },
  { name: 'source_type', aliases: ['source'], type: 'text', ops: TEXT_OPS, target: 'source_type' },
  { name: 'storage_tier', type: 'enum', ops: TEXT_OPS, enumValues: ['hot', 'warm', 'cold'], target: 'storage_tier' },

  // --- content / graph ---
  { name: 'content', aliases: ['text', 'body'], type: 'text', ops: [':', '='], target: 'content', description: 'Full-text match over content' },
  { name: 'tags', aliases: ['tag', 'label'], type: 'tag', ops: [':', '=', 'in'], target: 'tags' },
  { name: 'entity', type: 'text', ops: [':', '=', 'in'], target: 'entity', description: 'Memory references this entity (graph join)' },
  { name: 'topic', type: 'text', ops: [':', '=', 'in'], target: 'topic', description: 'Memory tagged with this topic (enrichment join)' },

  // --- scores (numeric, range-queryable) ---
  { name: 'quality', aliases: ['quality_score'], type: 'number', ops: NUMBER_OPS, sortable: true, target: 'quality_score', description: 'Quality score 0..1' },
  { name: 'salience', type: 'number', ops: NUMBER_OPS, sortable: true, target: 'salience' },
  { name: 'retention', aliases: ['retention_score'], type: 'number', ops: NUMBER_OPS, sortable: true, target: 'retention_score' },
  { name: 'anomaly_score', type: 'number', ops: NUMBER_OPS, sortable: true, target: 'anomaly_score' },
  { name: 'decay_rate', type: 'number', ops: NUMBER_OPS, target: 'decay_rate' },
  { name: 'priority', type: 'number', ops: NUMBER_OPS, sortable: true, target: 'priority' },
  { name: 'access_count', type: 'number', ops: NUMBER_OPS, sortable: true, target: 'access_count' },

  // --- temporal (date, range-queryable) ---
  { name: 'created', aliases: ['created_at'], type: 'date', ops: DATE_OPS, sortable: true, target: 'created_at' },
  { name: 'updated', aliases: ['updated_at'], type: 'date', ops: DATE_OPS, sortable: true, target: 'updated_at' },
  { name: 'accessed', aliases: ['accessed_at'], type: 'date', ops: DATE_OPS, sortable: true, target: 'accessed_at' },
  { name: 'event_date', aliases: ['event', 'occurred'], type: 'date', ops: DATE_OPS, sortable: true, target: 'event_date', description: 'When the event actually happened (dual-timestamp)' },
  { name: 'expires', aliases: ['expires_at'], type: 'date', ops: DATE_OPS, target: 'expires_at' },

  // --- flags (boolean) ---
  { name: 'pinned', aliases: ['is_pinned'], type: 'boolean', ops: BOOL_OPS, target: 'is_pinned' },
  { name: 'protected', aliases: ['is_protected'], type: 'boolean', ops: BOOL_OPS, target: 'is_protected' },
  { name: 'private', aliases: ['is_private'], type: 'boolean', ops: BOOL_OPS, target: 'is_private' },
  { name: 'dormant', aliases: ['is_dormant'], type: 'boolean', ops: BOOL_OPS, target: 'is_dormant' },
  { name: 'anomaly', aliases: ['is_anomaly'], type: 'boolean', ops: BOOL_OPS, target: 'is_anomaly' },
  { name: 'deleted', aliases: ['is_deleted'], type: 'boolean', ops: BOOL_OPS, target: 'is_deleted' },
];

/** Mem0-style open metadata namespace: `metadata.<key>` is always queryable. */
const NAMESPACES: readonly DynamicNamespace[] = [
  { prefix: 'metadata.', type: 'text', ops: [':', '=', '!=', 'in'], description: 'Arbitrary JSONB metadata attribute' },
];

/** The default Trix memory registry. Hosts may build their own. */
export function trixMemoryRegistry(): FieldRegistry {
  return new FieldRegistry(FIELDS, NAMESPACES);
}
