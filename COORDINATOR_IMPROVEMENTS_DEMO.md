# Coordinator Platform Enhancements

Inspired by Claude Code's coordinator pattern, we have significantly upgraded TrixDB's multi-agent capabilities.

## 1. Structured Worker Notifications
Workers now report their results in a structured format that includes a `Run ID`. This allows the coordinator to uniquely identify and follow up with specific workers.

**Example Output:**
```
## Worker Result [auth-investigator] | Run ID: run-a1b2c3d4
Status: completed | Cost: $0.0045 | Duration: 1250ms
Tools used: trix_search, node_read_file
Operations: 3 searched

Found a null pointer in src/auth/validate.ts at line 42.
The session object is undefined when the token is expired.
```

## 2. Agent Continuation (`agent_continue`)
Coordinators can now resume a specific worker's session using its `Run ID`. This preserves the worker's full message history, avoiding the need to re-read files or re-explain context.

**Tool Call:**
```json
{
  "tool": "agent_continue",
  "args": {
    "run_id": "run-a1b2c3d4",
    "message": "Fix the null pointer in validate.ts:42 by adding a null check."
  }
}
```

## 3. High-Signal Coordinator Rules
The orchestrator system prompt has been upgraded with strict "Coordinator" guidelines:
- **Phase-based workflows:** Guidance on parallelizing research and serializing implementation.
- **Synthesis over delegation:** Forbidden from saying "based on your findings." Coordinators must synthesize research into a concrete spec.
- **Independent Verification:** Encouraged to spawn fresh agents for verification to ensure "fresh eyes" on the code.

## Verification
- [x] **Automated Tests:** Core logic for history reconstruction verified in `agent-continue-logic.test.ts`.
- [x] **Notification Integrity:** Signature changes and parsing logic verified in `worker-notification.test.ts`.
- [x] **Regression Check:** Existing invoker budget logic remains intact.


## 4. Configurable Agent Purposes
Agents can now be configured with a specific `purpose` (coding, chat, chores). This adjusts their base instructions to focus on the task at hand.

**Example Base Prompt (Coding Purpose):**
> You are in coding mode. Focus on writing clean, tested, and idiomatic code. Use tree-sitter or LSP tools when available to verify your changes.

## 5. Magic Docs (Self-Updating Documentation)
The platform now has the infrastructure to detect "Magic Docs"—files with a `# MAGIC DOC: [title]` header. During dream cycles, these docs are flagged for autonomous updates based on recent learnings.

## 6. Real-Time LSP Feedback
When an agent writes a file (via `node_write_file`), the platform can now provide instant diagnostic feedback. This catches errors immediately, before the agent even attempts to run a test.

**Example Feedback:**
```
Wrote src/auth/validate.ts

LSP Diagnostics:
[ERROR] Property 'id' does not exist on type 'User | undefined'. (line 42, col 15)
```


## 7. Memory Taxonomy & Guardrails
Agents are now governed by a structured **Taxonomy of Mind**. This prevents memory bloat by explicitly forbidding the storage of data derivable from code or git.

**Memory Types:**
- **User:** Persistent roles and preferences.
- **Feedback:** Validated patterns and corrections.
- **Project:** Initiatives and non-code architectural decisions.
- **Reference:** Pointers to external systems.

**Trust but Verify:**
Agents are now instructed to verify any file or function recalled from memory before acting on it, ensuring they don't hallucinate based on stale memory records.

## 8. Progress Heartbeat Infrastructure
Added the foundation for background progress summarization. Agents can now generate concise, 3-5 word updates about their current activity, allowing for high-signal observability during long-running tasks.


## 9. Granular Context Pruning (Microcompact)
To handle extremely long-running sessions, Trix now supports **Microcompact**. Unlike traditional compaction which summarizes the entire history, Microcompact selectively "zeros out" large, stale tool results (like `grep` or `ls` outputs) that are no longer in the immediate context window.

**Benefits:**
- **Drastic Token Savings:** Removes heavy text blocks that are no longer needed for reasoning.
- **Structural Integrity:** Preserves the *turn history* (the fact that a search happened) while dumping the *raw data*.
- **Infinite Sessions:** Prevents context window overflow in complex autonomous tasks.


## 10. Multi-LLM Advisor Pattern
Agents can now request a "second opinion" from a high-intelligence Advisor model (Claude 3.5 Sonnet) using the `trix_advisor_review` tool. This is ideal for verifying complex code changes or security-critical plans before they are executed.

## 11. API-Round Boundary Compaction
The platform now understands API boundaries. When compacting history, it ensures that tool calls and their results are never split across a compaction boundary, maintaining the logical consistency of the conversation.

## 12. "While You Were Away" Summaries
When a user resumes a long or idle session, Trix automatically generates a concise 1-2 sentence recap of the high-level task and the next step. This provides instant orientation without having to re-read the entire transcript.


## 13. Agentic VCR (Deterministic Testing)
Trix now supports **Agentic VCR**, allowing developers to record and replay agent sessions. This ensures that changes to the agent's prompt or tools don't break established reasoning paths, enabling deterministic regression testing for non-deterministic models.

## 14. Smart Shell Validator
A new security layer parses and analyzes every shell command before execution. It detects and blocks dangerous patterns that traditional filters miss, such as command substitution (`$()`), backticks (` ` `), and attempts to start interactive applications that would hang the agent.

## 15. Haiku-based Tool Summaries
The platform now uses a fast, cost-effective model (Claude Haiku) to generate human-readable activity labels for every tool batch. Users see high-signal updates like "Searched auth module" instead of raw tool call logs.

## 16. Predictive Prompt Suggestions
After every exchange, Trix predicts the 3 most likely next steps the user might want to take. These suggestions are context-aware and help guide the user through complex workflows.


## 17. Purpose-Specific Tool Policies
The platform now enforces strict tool boundaries based on an agent's configured purpose. This prevents mind-drift and ensures agents stay focused on their expertise.
- **Coordinators:** Only get coordination and memory tools.
- **Coders:** Get full filesystem and shell access.
- **Chat/Chores:** Restricted to their specific operational domains.

## 18. Active Memory Extraction
Trix now uses the "End-of-Turn Fork" pattern to autonomously identify new learnings. After a conversation ends, a background agent reviews the transcript to extract high-value memories without interrupting the user.

## 19. Elicitation Pattern
Agents are now trained to **elicit information** when requests are ambiguous. Instead of guessing, they will ask for clarification or present options, significantly reducing errors in autonomous execution.

## 20. Project Onboarding Tool
Coordinators can now use `trix_onboard_project` to quickly map out a new codebase. This tool scans the project structure and creates a persistent "Map of the Territory" memory in the Space.

