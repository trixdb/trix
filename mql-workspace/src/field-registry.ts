import { CompareOp } from './ast.js';

/**
 * The field registry is MQL's single source of truth for *what is queryable*.
 * Adding a queryable memory attribute is one {@link FieldDef} entry — the
 * lexer, parser, validator, and compiler need no changes. This is the
 * open/closed seam that lets a host (trix-api) inject its own schema.
 */
export type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'enum' | 'id' | 'tag';

export interface FieldDef {
  /** Canonical field name used in the compiled output. */
  readonly name: string;
  readonly type: FieldType;
  /** Operators permitted for this field. */
  readonly ops: readonly CompareOp[];
  readonly aliases?: readonly string[];
  /** Permitted values when `type === 'enum'`. */
  readonly enumValues?: readonly string[];
  /** Whether the field may appear in `order by`. */
  readonly sortable?: boolean;
  readonly description?: string;
  /** Where this field lands in the compiled query plan (compiler hint). */
  readonly target?: string;
}

export interface ResolvedField extends FieldDef {
  /** The name as written by the user (an alias or a dynamic-prefix path). */
  readonly matchedAs: string;
  /** True when matched via a dynamic prefix (e.g. `metadata.*`). */
  readonly dynamic: boolean;
}

/** A `metadata.` style open namespace: any suffix is valid with these rules. */
export interface DynamicNamespace {
  readonly prefix: string;
  readonly type: FieldType;
  readonly ops: readonly CompareOp[];
  readonly description?: string;
}

/** Operator groups, reused by the catalog to keep field defs declarative. */
export const EQUALITY_OPS: readonly CompareOp[] = [':', '=', '!=', 'in'];
export const RANGE_OPS: readonly CompareOp[] = ['>', '>=', '<', '<=', 'between'];
export const DATE_OPS: readonly CompareOp[] = ['>', '>=', '<', '<=', '=', '!=', 'between'];
export const NUMBER_OPS: readonly CompareOp[] = [...EQUALITY_OPS, ...RANGE_OPS];
export const BOOL_OPS: readonly CompareOp[] = [':', '='];

export class FieldRegistry {
  private readonly byName = new Map<string, FieldDef>();

  constructor(
    fields: readonly FieldDef[],
    private readonly namespaces: readonly DynamicNamespace[] = [],
  ) {
    for (const f of fields) {
      this.register(f.name, f);
      for (const alias of f.aliases ?? []) this.register(alias, f);
    }
  }

  private register(key: string, def: FieldDef): void {
    const norm = key.toLowerCase();
    if (this.byName.has(norm)) throw new Error(`duplicate MQL field/alias: ${key}`);
    this.byName.set(norm, def);
  }

  /** Resolve a written field name (alias- and dynamic-prefix aware). */
  resolve(written: string): ResolvedField | undefined {
    const def = this.byName.get(written.toLowerCase());
    if (def) return { ...def, matchedAs: written, dynamic: false };
    const ns = this.namespaces.find((n) => written.toLowerCase().startsWith(n.prefix));
    if (!ns) return undefined;
    return {
      name: written,
      type: ns.type,
      ops: ns.ops,
      matchedAs: written,
      dynamic: true,
      ...(ns.description !== undefined ? { description: ns.description } : {}),
    };
  }

  /** All canonical fields, for docs / autocomplete / error suggestions. */
  fields(): readonly FieldDef[] {
    return [...new Set(this.byName.values())];
  }
}
