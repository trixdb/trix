# Tasks and Meta Information for Trix: Comprehensive Research Analysis

## Executive Summary

This document synthesizes research from 5 parallel investigation tracks to propose how **Tasks** and **Meta-information** could transform Trix from a memory system into a full cognitive workspace for AI agents and humans.

**Key Finding**: The intersection of memory and task management is where modern PKM systems and AI agents achieve their highest value. Trix already has 70% of the infrastructure needed—the remaining 30% is strategic integration.

---

## Part 1: Current Trix Architecture Analysis

### Existing Infrastructure That Supports Tasks

| Feature | Status | Extension Path |
|---------|--------|----------------|
| Session type="task" | ✅ Exists | Extend with task-specific fields |
| Highlight type="todo" | ✅ Exists | Add status, due_date, assignee |
| Enrichment queue (BullMQ) | ✅ Exists | Reuse for task processing |
| Temporal relationships (valid_from/to) | ✅ Exists | Apply to tasks |
| Memory relationships (18 types) | ✅ Exists | Add task-memory links |
| Conflict detection | ✅ Exists | Extend to task conflicts |
| Soft delete infrastructure | ✅ Exists | Apply to tasks |
| Repository/Service patterns | ✅ Exists | Follow for TaskRepository |

### Key Database Tables to Leverage

```
memories          → Task context (memory_id FK)
sessions          → Task grouping (session_id FK)
spaces            → Task scoping (space_id FK)
clusters          → Task categorization
memory_relationships → Task dependencies
enrichments       → Task status tracking model
highlights        → Existing todo type
```

---

## Part 2: Research Findings

### 2.1 PKM System Patterns (Notion, Obsidian, Roam, Logseq, Tana)

**Critical Insight**: The most successful systems treat tasks and knowledge as the same atomic unit with different metadata.

| System | Key Pattern | Trix Application |
|--------|-------------|------------------|
| Notion | Everything is a database row with properties | Tasks as memories with status/due_date metadata |
| Obsidian | Dataview queries surface tasks from notes | Query engine for tasks across memories |
| Roam | Blocks can be both notes and tasks | Highlights already support todo type |
| Logseq | States: TODO→DOING→DONE | Session status model matches |
| Tana | Supertags make same node appear as task/note | content_type could include "task" |

**Design Pattern to Adopt**: **Actionability Gradient** (from PARA method)
- Most actionable → Tasks with due dates
- Medium actionable → Session tasks
- Low actionable → Reference memories
- Archived → Completed/archived tasks

### 2.2 LLM Agent Task Management Patterns

**BabyAGI Pattern** (foundational):
```
Loop:
  1. Execute current task
  2. Create new tasks from results
  3. Prioritize task list
  4. Repeat
```

**CrewAI Dual Approach**:
- **Crews**: Autonomous agents with role-based collaboration
- **Flows**: Event-driven, deterministic orchestration

**LangGraph Checkpointing**:
- Save state at every super-step
- Enables human-in-the-loop, memory, time travel, fault-tolerance
- Trix parallel: Save task progress to enable session resumption

**Key Finding**: Modern AI agents need persistent task state that survives crashes and sessions.

### 2.3 Meta-Information Patterns

**What makes memories useful** (from knowledge graph research):

| Meta-Info Type | Purpose | Trix Field |
|----------------|---------|------------|
| Provenance | Track where facts came from | source, created_by |
| Temporal validity | When facts are true | valid_from, valid_to |
| Confidence | Belief probability | confidence_score |
| Access patterns | Usage frequency | access_count, accessed_at |
| Decay | Memory strength over time | salience, decay_rate (exists!) |
| Relationships | How memories connect | memory_relationships (exists!) |

**Memory Lifecycle** (from academic research):
1. **Formation** → Extract with provenance
2. **Consolidation** → Cluster into semantic memory
3. **Retrieval** → Multi-signal scoring (relevance + recency + importance)
4. **Evolution** → Continuous updating
5. **Forgetting** → Strategic pruning via decay

**Trix already implements salience/decay_rate!** This is advanced memory lifecycle management.

---

## Part 3: Proposed Task System Design

### 3.1 Database Schema

```sql
-- Core tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts,
    space_id UUID REFERENCES spaces,
    created_by UUID NOT NULL REFERENCES api_keys,

    -- Core task data
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status task_status DEFAULT 'open',  -- open, in_progress, blocked, done, cancelled
    priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),

    -- Organization
    tags TEXT[],
    assigned_to UUID REFERENCES api_keys,  -- For multi-agent assignment

    -- Context linking (the key differentiator)
    session_id UUID REFERENCES sessions,   -- Link to session
    memory_id UUID REFERENCES memories,    -- Link to context memory
    cluster_id UUID REFERENCES clusters,   -- Link to topic cluster

    -- Lifecycle
    due_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    blocked_reason TEXT,

    -- Progress
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    estimated_effort VARCHAR(50),  -- e.g., '2h', '1d', '1w'

    -- Temporal validity (bi-temporal like relationships)
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_to TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Soft delete
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID
);

-- Task dependencies (graph structure)
CREATE TABLE task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES tasks ON DELETE CASCADE,
    dependency_type VARCHAR(50) DEFAULT 'blocks',  -- blocks, requires, related_to
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES api_keys,
    UNIQUE(task_id, depends_on_task_id, dependency_type)
);

-- Task checkpoints (for LLM session sync)
CREATE TABLE task_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks ON DELETE CASCADE,
    checkpoint_data JSONB NOT NULL,  -- Serialized state
    step_number INTEGER NOT NULL,
    agent_id UUID,  -- Which agent created checkpoint
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Task comments/updates (audit trail)
CREATE TABLE task_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks ON DELETE CASCADE,
    update_type VARCHAR(50) NOT NULL,  -- status_change, comment, progress, assignment
    previous_value JSONB,
    new_value JSONB,
    comment TEXT,
    created_by UUID NOT NULL REFERENCES api_keys,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tasks_account_status ON tasks(account_id, status) WHERE is_deleted = false;
CREATE INDEX idx_tasks_session ON tasks(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_tasks_due ON tasks(due_at) WHERE status IN ('open', 'in_progress', 'blocked');
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_task_dependencies_task ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends ON task_dependencies(depends_on_task_id);

-- Enum type
CREATE TYPE task_status AS ENUM ('open', 'in_progress', 'blocked', 'done', 'cancelled');
```

### 3.2 Enhanced Meta-Information for Existing Entities

```sql
-- Add meta columns to memories (some already exist)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 1.0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_type VARCHAR(50);  -- user, agent, import, crawl
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS verified_by UUID;

-- Add meta columns to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS task_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS completed_task_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS progress_percent INTEGER GENERATED ALWAYS AS (
    CASE WHEN task_count = 0 THEN 0
    ELSE (completed_task_count * 100 / task_count)
    END
) STORED;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS checkpoint_data JSONB;  -- For LLM session sync
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agent_id UUID;  -- Which agent owns session

-- Add meta columns to spaces
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS task_count INTEGER DEFAULT 0;
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS open_task_count INTEGER DEFAULT 0;
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS default_task_priority INTEGER DEFAULT 3;
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS task_workflow JSONB;  -- Custom status workflow

-- Add meta columns to clusters
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS task_affinity FLOAT DEFAULT 0;  -- How task-oriented
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS actionability_score FLOAT DEFAULT 0;  -- PARA-style
```

### 3.3 Triggers for Automatic Updates

```sql
-- Update session task counts
CREATE OR REPLACE FUNCTION update_session_task_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE sessions SET
            task_count = task_count + 1,
            completed_task_count = completed_task_count + (CASE WHEN NEW.status = 'done' THEN 1 ELSE 0 END)
        WHERE id = NEW.session_id;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle status changes
        IF OLD.status != 'done' AND NEW.status = 'done' THEN
            UPDATE sessions SET completed_task_count = completed_task_count + 1
            WHERE id = NEW.session_id;
        ELSIF OLD.status = 'done' AND NEW.status != 'done' THEN
            UPDATE sessions SET completed_task_count = completed_task_count - 1
            WHERE id = NEW.session_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE sessions SET
            task_count = task_count - 1,
            completed_task_count = completed_task_count - (CASE WHEN OLD.status = 'done' THEN 1 ELSE 0 END)
        WHERE id = OLD.session_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_session_task_counts
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION update_session_task_counts();
```

---

## Part 4: Integration Points

### 4.1 Session-Task Synchronization (For LLM Agents)

**Use Case**: Claude Code, Cursor, or custom agents using Trix can persist their task lists across sessions.

```javascript
// Example: Agent saves task state to Trix session
POST /api/v1/cli-sessions/:sessionId/checkpoint
{
  "checkpoint_data": {
    "todos": [
      { "id": "t1", "content": "Fix auth bug", "status": "completed" },
      { "id": "t2", "content": "Add tests", "status": "in_progress" }
    ],
    "current_task": "t2",
    "context": { "file": "auth.js", "line": 42 }
  },
  "step_number": 5
}

// Agent resumes from checkpoint
GET /api/v1/cli-sessions/:sessionId/checkpoint
// Returns last checkpoint_data for seamless resumption
```

**Benefits**:
- Agent crashes don't lose task progress
- Tasks survive across conversation sessions
- Multi-agent handoffs preserve context

### 4.2 Memory-Task Linking

**Use Case**: Tasks extracted from memories, tasks that produce memories.

```javascript
// Extract tasks from memory content
POST /api/v1/memories/:memoryId/extract-tasks
// Uses LLM to find actionable items, creates linked tasks

// Create memory from completed task
POST /api/v1/tasks/:taskId/complete
{
  "create_memory": true,
  "memory_content": "Completed implementation of OAuth2 flow. Key decisions: ..."
}
// Creates memory linked to task for future reference
```

**Relationship Types to Add**:
```javascript
TASK_RELATIONSHIP_TYPES = [
  'implements',      // Task implements what memory describes
  'derived_from',    // Task derived from memory content
  'produces',        // Task produced this memory on completion
  'blocked_by',      // Task blocked by issue in memory
  'references',      // Task references memory for context
]
```

### 4.3 Cluster-Based Task Organization

**Use Case**: Automatically group related tasks, identify task themes.

```javascript
// Find tasks related to a cluster
GET /api/v1/clusters/:clusterId/tasks
// Returns tasks whose linked memories are in this cluster

// Auto-assign task to cluster based on embedding
POST /api/v1/tasks
{
  "title": "Implement caching layer",
  "description": "Add Redis caching for API responses",
  "auto_cluster": true  // Embeds and assigns to best-fit cluster
}
```

### 4.4 Space-Scoped Task Workflows

**Use Case**: Different spaces have different task workflows (e.g., development vs. personal).

```javascript
// Space with custom workflow
PATCH /api/v1/spaces/:spaceId
{
  "task_workflow": {
    "statuses": ["backlog", "ready", "in_progress", "review", "done"],
    "transitions": {
      "backlog": ["ready"],
      "ready": ["in_progress", "backlog"],
      "in_progress": ["review", "blocked"],
      "review": ["done", "in_progress"],
      "blocked": ["in_progress"]
    }
  }
}
```

---

## Part 5: API Design

### 5.1 Task Endpoints

```javascript
// CRUD
POST   /api/v1/tasks                    // Create task
GET    /api/v1/tasks                    // List tasks (with filtering)
GET    /api/v1/tasks/:id                // Get task
PATCH  /api/v1/tasks/:id                // Update task
DELETE /api/v1/tasks/:id                // Soft delete task

// Status transitions
POST   /api/v1/tasks/:id/start          // → in_progress
POST   /api/v1/tasks/:id/block          // → blocked (with reason)
POST   /api/v1/tasks/:id/unblock        // → in_progress
POST   /api/v1/tasks/:id/complete       // → done
POST   /api/v1/tasks/:id/cancel         // → cancelled
POST   /api/v1/tasks/:id/reopen         // → open

// Dependencies
POST   /api/v1/tasks/:id/dependencies   // Add dependency
DELETE /api/v1/tasks/:id/dependencies/:depId  // Remove dependency
GET    /api/v1/tasks/:id/blocking       // Tasks this blocks
GET    /api/v1/tasks/:id/blocked-by     // Tasks blocking this

// Checkpoints (for agent sync)
POST   /api/v1/tasks/:id/checkpoint     // Save checkpoint
GET    /api/v1/tasks/:id/checkpoint     // Get latest checkpoint
GET    /api/v1/tasks/:id/checkpoints    // List all checkpoints

// Batch operations
POST   /api/v1/tasks/batch/create       // Create multiple
POST   /api/v1/tasks/batch/update       // Update multiple
POST   /api/v1/tasks/batch/complete     // Complete multiple

// Discovery
GET    /api/v1/tasks/due                // Tasks due soon
GET    /api/v1/tasks/blocked            // All blocked tasks
GET    /api/v1/tasks/stale              // Tasks not updated recently
GET    /api/v1/tasks/by-session/:id     // Tasks for session
GET    /api/v1/tasks/by-memory/:id      // Tasks linked to memory
```

### 5.2 Session Task Sync Endpoints

```javascript
// Session checkpointing for LLM agents
POST   /api/v1/cli-sessions/:id/checkpoint      // Save full state
GET    /api/v1/cli-sessions/:id/checkpoint      // Resume from checkpoint
GET    /api/v1/cli-sessions/:id/tasks           // Get session tasks
POST   /api/v1/cli-sessions/:id/tasks/sync      // Bulk sync tasks from agent

// Session task statistics
GET    /api/v1/cli-sessions/:id/progress        // Task completion progress
```

### 5.3 Query Parameters for Task Listing

```javascript
GET /api/v1/tasks?
  status=open,in_progress          // Filter by status
  &priority=4,5                    // High priority only
  &assigned_to=me                  // My tasks
  &due_before=2026-01-25           // Due soon
  &session_id=xxx                  // For specific session
  &space_id=xxx                    // In specific space
  &has_memory=true                 // Linked to memories
  &blocked=false                   // Not blocked
  &sort=due_at                     // Sort field
  &order=asc                       // Sort order
  &limit=50&offset=0               // Pagination
```

---

## Part 6: CLI Integration

### 6.1 New Commands

```bash
# Task CRUD
trix task create "Implement OAuth2" --priority 5 --due 2026-01-25
trix task list --status open,in_progress --sort due
trix task show <id>
trix task update <id> --priority 3 --description "Updated scope"
trix task delete <id>

# Status transitions
trix task start <id>
trix task block <id> --reason "Waiting for API docs"
trix task unblock <id>
trix task complete <id> [--create-memory]
trix task cancel <id>

# Dependencies
trix task depends <id> --on <other-id>
trix task undepends <id> --from <other-id>
trix task blocked-by <id>
trix task blocking <id>

# Session sync (for LLM integration)
trix session checkpoint --data '{"todos": [...], "step": 5}'
trix session resume  # Outputs last checkpoint

# Discovery
trix task due --within 7d
trix task stale --days 14
trix task blocked
trix task mine

# Bulk operations
trix task complete --session <id>  # Complete all session tasks
trix task import tasks.json
trix task export --format json
```

### 6.2 Session Integration

```bash
# Start session with tasks
trix session new "Bug Fix Sprint" --type task
trix task create "Fix login bug" --session current
trix task create "Add tests" --session current --depends-on <previous-id>

# View session progress
trix session progress
# Output: 3/10 tasks completed (30%)

# Complete session (completes remaining tasks or warns)
trix session complete
```

### 6.3 Memory Integration

```bash
# Link task to memory
trix task create "Implement feature" --context <memory-id>

# Extract tasks from memory
trix memory extract-tasks <id>
# Output: Found 3 actionable items. Create tasks? [Y/n]

# Create memory from task completion
trix task complete <id> --remember "Key learnings: ..."
```

---

## Part 7: Multi-Agent Coordination

### 7.1 Agent Task Assignment

```javascript
// Agent claims task
POST /api/v1/tasks/:id/claim
{
  "agent_id": "agent-123",
  "expected_duration": "2h"
}

// Agent releases task
POST /api/v1/tasks/:id/release
{
  "reason": "Need human input"
}

// Check for conflicting claims
GET /api/v1/tasks/:id/claims
```

### 7.2 Task Handoffs

```javascript
// Hand off task between agents
POST /api/v1/tasks/:id/handoff
{
  "from_agent": "agent-123",
  "to_agent": "agent-456",
  "context": {
    "progress": "Completed analysis, ready for implementation",
    "checkpoint": { ... }
  }
}
```

### 7.3 Conflict Resolution

Extend existing `memory_conflicts` table to handle task conflicts:

```sql
-- Task conflicts (multi-agent)
CREATE TABLE task_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks,
    conflicting_agent_1 UUID,
    conflicting_agent_2 UUID,
    conflict_type VARCHAR(50),  -- concurrent_claim, status_conflict, dependency_cycle
    resolution_status VARCHAR(20) DEFAULT 'pending',
    resolution_strategy VARCHAR(50),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    conflict_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Part 8: Value Propositions

### 8.1 For LLM Agents (Claude Code, Custom Agents)

| Benefit | How Trix Enables It |
|---------|---------------------|
| **Session persistence** | Checkpoint API saves task state across conversations |
| **Context continuity** | Tasks linked to memories provide full context on resume |
| **Multi-agent handoffs** | Task assignment and handoff APIs enable coordination |
| **Progress tracking** | Session progress metrics show completion status |
| **Crash recovery** | Checkpoints enable exact state restoration |

### 8.2 For Developers Using Trix

| Benefit | How Trix Enables It |
|---------|---------------------|
| **Unified workspace** | Tasks and knowledge in one system |
| **Context-rich tasks** | Tasks linked to relevant memories |
| **Dependency tracking** | Task graph prevents blocked work |
| **Space isolation** | Project-specific task workflows |
| **Semantic search** | Find tasks by meaning, not just keywords |

### 8.3 For Teams

| Benefit | How Trix Enables It |
|---------|---------------------|
| **Shared knowledge-tasks** | Team members see task context |
| **Audit trail** | Task updates tracked with provenance |
| **Conflict resolution** | Multi-agent conflict detection |
| **Progress visibility** | Session/space task metrics |

---

## Part 9: Implementation Priority

### Phase 1: Core Tasks (1-2 weeks)
1. Create `tasks` table with basic fields
2. Create `TaskRepository` and `TaskService`
3. Add CRUD API endpoints
4. Add basic CLI commands
5. Add task-session linking

### Phase 2: Agent Sync (1 week)
1. Add checkpoint tables and APIs
2. Session checkpoint/resume
3. Task progress tracking
4. Session progress aggregation

### Phase 3: Memory Integration (1 week)
1. Task-memory relationships
2. Extract tasks from memories (LLM)
3. Create memories from completed tasks
4. Semantic task search

### Phase 4: Dependencies & Workflow (1 week)
1. Task dependencies table
2. Blocking/blocked-by queries
3. Space-specific workflows
4. Dependency cycle detection

### Phase 5: Multi-Agent (1 week)
1. Task claims and assignments
2. Task handoffs
3. Conflict detection
4. Resolution strategies

---

## Part 10: Research Sources

### Codebase Analysis
- Trix API: `src/routes/`, `src/services/`, `src/repositories/`
- Database: Migrations in `src/db/migrations/`
- Existing patterns: Sessions, Highlights, Enrichments

### External Research
- **PKM Systems**: Notion, Obsidian, Roam, Logseq, Tana
- **Methodologies**: PARA, GTD, Zettelkasten, Building a Second Brain
- **AI Agents**: AutoGPT, BabyAGI, CrewAI, LangGraph, Temporal
- **Knowledge Graphs**: Netflix, Diffbot, Zep/Graphiti
- **Coding Tools**: Claude Code, Cursor, GitHub Copilot

### Key Academic/Industry Sources
- [Taskade PKM Guide](https://www.taskade.com/blog/personal-knowledge-management-pkm-guide)
- [LangGraph Checkpointing](https://docs.langchain.com/oss/python/langgraph/persistence)
- [Temporal Durable Execution](https://temporal.io/blog/building-a-persistent-conversational-ai-chatbot-with-temporal)
- [Memory in Agentic AI](https://genesishumanexperience.com/2025/11/03/memory-in-agentic-ai-systems)
- [Zep Temporal KG](https://blog.getzep.com/content/files/2025/01/ZEP__USING_KNOWLEDGE_GRAPHS_TO_POWER_LLM_AGENT_MEMORY_2025011700.pdf)

---

## Conclusion

Adding Tasks and Meta-information to Trix transforms it from a "memory store" into a **cognitive workspace** that:

1. **Bridges knowledge and action** (the core value of modern PKM)
2. **Enables persistent AI agent coordination** (essential for production agents)
3. **Tracks memory lifecycle with rich metadata** (provenance, confidence, decay)
4. **Supports multi-agent collaboration** (claims, handoffs, conflict resolution)

The existing Trix infrastructure (sessions, highlights, enrichments, relationships, temporal tracking, decay/salience) provides 70% of the foundation. The proposed additions complete the vision of an AI-native memory system that truly enhances both human and agent cognition.
