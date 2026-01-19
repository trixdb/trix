# Healthy Code Contract

Non-controversial coding guidelines for humans and AI agents.

## Quick Reference for LLMs

When writing or modifying code:

```
Produce production-ready code optimized for readability and maintainability.
Keep changes localized, reduce coupling, and make illegal states hard to represent.
Validate inputs at boundaries and fail fast with clear errors (without leaking secrets).
Add automated tests for critical logic. Avoid flaky tests.
Use idiomatic patterns, formatting, and lint-friendly style.
Prefer small, composable functions/modules.
Include observability (structured logs/metrics where relevant).
Document non-obvious decisions ("why"), not what the code already shows.
Pick the simplest approach that is safe, testable, and easy to change.
```

## File & Function Limits

| Metric | Soft Limit | Hard Limit | Action When Exceeded |
|--------|------------|------------|----------------------|
| File lines | 300 | 500 | Split into modules |
| Function lines | 25 | 40 | Extract sub-functions |
| Function params | 3 | 5 | Use options object |
| Nesting depth | 2 | 4 | Extract or early return |
| Cyclomatic complexity | 8 | 15 | Simplify logic |

## The 10 Principles

### 1. Readability is the Default
- Prefer clear names over cleverness
- Make intent obvious at a glance
- Keep functions/modules focused on one job

### 2. Make Change Easy
- Minimize hidden coupling
- Keep related logic close together
- If a change requires editing many files, treat that as a smell

### 3. Fail Fast, Fail Loud, Fail Safe
- Validate inputs at boundaries
- Use explicit errors, not silent fallbacks
- Don't leak secrets; avoid overly detailed error messages in public APIs

### 4. Tests Exist Where Mistakes Are Expensive
- Add automated tests for business rules, money, permissions, and critical workflows
- Prefer fewer high-value tests over lots of low-signal tests
- Avoid flaky tests; fix or delete them

### 5. Refactor as a Continuous Activity
- If you touch code, leave it cleaner than you found it
- Small refactors are normal work, not special projects
- Don't refactor without a safety net (tests/logging/feature flags)

### 6. Use Tools to Prevent Dumb Mistakes
- Formatters + linters + type checking (where available)
- CI runs tests and static checks on every change
- Treat warnings as something to resolve, not ignore

### 7. Code Review is About Risk Reduction
- Review for: correctness, clarity, security, maintainability
- Prefer small PRs
- Comment on the code, not the person

### 8. Observability is Part of "Done"
- Log important state changes and failures (with correlation IDs if relevant)
- Track key metrics (latency, errors, throughput)
- Ensure you can diagnose production issues without guessing

### 9. Document Only What Helps Future Change
- Document decisions, constraints, and "why"
- Don't document what the code already says
- Keep docs close to code and kept up-to-date

### 10. Security and Privacy Are Non-Negotiable at Boundaries
- Principle of least privilege
- Sanitize/escape user input where relevant
- Protect secrets; avoid logging sensitive data

## Anti-Patterns to Avoid

**Over-engineering:**
- Don't add features beyond what was asked
- Don't create abstractions for one-time use
- Don't add "just in case" error handling
- Don't design for hypothetical future requirements

**Unnecessary changes:**
- Don't refactor unrelated code while fixing a bug
- Don't add comments/docs to code you didn't change
- Don't add backward-compatibility shims for unused code
- Don't rename unused variables to `_var`

**Complexity creep:**
- Three similar lines > premature abstraction
- Trust internal code and framework guarantees
- Only validate at system boundaries

## When to Break the Rules

These guidelines are not absolute. Break them when:

1. **Performance requires it** - Profile first, then optimize with a comment explaining why
2. **Framework constraints** - Some frameworks require specific patterns
3. **Legacy code boundaries** - Maintain consistency within a file/module
4. **Explicit user request** - User knows their codebase best

When breaking a guideline, add a brief comment explaining why.

## Enforcement Checklist

For CI/CD pipelines:

```yaml
# Example checks
- [ ] Linter passes (ESLint/Biome/etc.)
- [ ] Type check passes (if applicable)
- [ ] No files > 500 lines
- [ ] No functions > 40 lines
- [ ] Test coverage for critical paths
- [ ] No secrets in code
- [ ] No TODOs without issue links
```

## References

- Clean Code (Robert C. Martin)
- SOLID Principles
- The Pragmatic Programmer
- OWASP Top 10
