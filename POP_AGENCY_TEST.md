# Pop! Design Agency — Full E2E Agent Test

## Goal
Test the complete autonomous agent loop in production: create a project, generate tasks, have an agent execute them using daemon shell access, create a GitHub repo, build a landing page, and deploy it live.

## Prerequisites

### Production Services (all confirmed working)
- **trix-api**: `https://api.trixdb.com` — Cohere primary embeddings, circuit breaker deployed
- **trix-bots**: Railway — Anthropic LLM (`claude-sonnet-4-20250514`), parallel memory context
- **trix-app**: `https://trix-app-production.up.railway.app` — Retrix UI with Chat button, capability picker
- **trix-daemon**: roberts-desktop — Online, shell commands verified working (signature fix deployed)

### Login
- URL: `https://trix-app-production.up.railway.app`
- Email: `robert@zivrio.com`
- Password: `123qwe!"#QWE`

### Key IDs
- DevOps Agent ID: `2821c5d8-21f4-48f3-8292-61925e5fc28f` (model: `claude-sonnet-4-20250514`, provider: `anthropic`)
- roberts-desktop node ID: `164457d5-c8aa-47d1-94d7-d075647e24b3`

---

## Test Steps

### Step 1: Grant DevOps Agent access to roberts-desktop

Navigate to: Toolbox → Agents → DevOps Agent → Nodes tab

1. Click "Add node"
2. Select "roberts-desktop"
3. Set permission to "Execute"
4. Select capabilities: Shell, Git, Filesystem, HTTP, Code Exec
5. Click "Grant Access"

**Verify**: Grant row shows with capability badges (Shell, Git, Filesystem, HTTP, Code Exec)

### Step 2: Create the Pop! project

Navigate to: Projects (sidebar)

1. Click "Create Project" (or "+" button)
2. Name: `Pop! Design Agency`
3. Description: `Landing page for Pop! — a bold, creative design agency. Modern, vibrant, scroll-stopping.`
4. Click Create

**Verify**: Project appears in project list

### Step 3: Add tasks to the project

In the Pop! project, create these tasks in order:

1. **"Set up GitHub repo for pop-agency"**
   - Priority: High
   - Description: `Create a new GitHub repo called pop-agency. Initialize with README, .gitignore (Node), and MIT license.`

2. **"Create brand identity and copy"**
   - Priority: High
   - Description: `Define Pop!'s brand: tagline, color palette (bold/vibrant), typography choices, and key copy sections (hero, services, about, contact). Write all copy to a brand-guide.md file.`

3. **"Build landing page with HTML/CSS/JS"**
   - Priority: Medium
   - Description: `Create a single-page landing page for Pop! using the brand guide. Must include: hero section with tagline, services grid, about section, contact form, footer. Use modern CSS (grid, custom properties, animations). Mobile responsive. No frameworks — pure HTML/CSS/JS.`

4. **"Deploy to Vercel or Netlify"**
   - Priority: Medium
   - Description: `Deploy the landing page to Vercel or Netlify via CLI. The site should be accessible via a public URL. Commit final code and push to GitHub before deploying.`

5. **"Verify deployment and store results"**
   - Priority: Low
   - Description: `Verify the deployed site is accessible. Take note of the public URL. Store a memory with the project summary, repo URL, and deployed site URL.`

**Verify**: 5 tasks visible in the project, all assigned to DevOps Agent

### Step 4: Assign all tasks to the DevOps Agent

For each task:
1. Click the task
2. Set assignee to "DevOps Agent" (type: agent)
3. Save

Alternatively, if creating tasks from the agent's Tasks tab:
- Navigate to Toolbox → Agents → DevOps Agent → Tasks tab
- Use "Create Task" to add each task with `assignee_id: DevOps Agent`

### Step 5: Trigger the agent

Option A — Via Heartbeat (autonomous):
1. Navigate to DevOps Agent detail page
2. Click "Run" button
3. The agent should wake up, see its assigned tasks, and start working

Option B — Via Test Panel (manual trigger):
1. Navigate to DevOps Agent → Test tab
2. Enter message: `You have tasks assigned to you in the Pop! Design Agency project. Start working on them autonomously. Begin with the GitHub repo setup, then work through each task in priority order. Use node_exec to run commands on roberts-desktop. When done with each task, mark it complete and move to the next.`
3. Click "Run Test"

Option C — Via Chat:
1. Click "Chat" button on DevOps Agent
2. Send: `Start working on your assigned tasks for the Pop! Design Agency project. Use your daemon tools to create the repo, write code, and deploy. Work through all tasks autonomously.`
3. Click "Ask AI"

### Step 6: Monitor execution

**In Retrix UI:**
- Watch the Runs tab for execution progress
- Check Tasks tab for status changes (todo → in_progress → done)
- Check the Live Execution viewer on the Test tab

**In Railway logs:**
```bash
cd ~/code/trix/trix-bots
railway service trix-bots
railway logs 2>&1 | grep -E "Processing|FSM|completed|failed|Tool search|node_exec|task_"
```

### Step 7: Verify results

1. **Tasks completed**: All 5 tasks should show "done" status
2. **GitHub repo created**: Check `https://github.com/<user>/pop-agency`
3. **Code written**: Repo should contain `index.html`, `style.css`, `brand-guide.md`
4. **Site deployed**: A public URL should be accessible (Vercel/Netlify)
5. **Memory stored**: Agent should have stored a summary memory with project details

---

## Expected Agent Behavior

The agent should:
1. **Triage** — Check task_list, see 5 assigned tasks, prioritize by priority
2. **GitHub setup** — Run `gh repo create pop-agency --public --clone` via node_exec on roberts-desktop
3. **Brand guide** — Create `brand-guide.md` with copy, colors, typography via node_exec (`cat > brand-guide.md << 'EOF'`)
4. **Landing page** — Write `index.html` and `style.css` with modern design via node_exec
5. **Deploy** — Run `npx vercel --yes` or `npx netlify deploy --prod` via node_exec
6. **Verify** — Curl the deployed URL, confirm it works
7. **Complete tasks** — Call task_complete for each task as it finishes
8. **Store learnings** — Use trix_store to save the project summary

---

## What to watch for

### Success indicators
- Agent uses `node_exec` tool on roberts-desktop
- Commands execute and return output (not "signature verification failed")
- Tasks transition from `todo` → `in_progress` → `done`
- Agent stores memories tagged with `agent:{id}`
- A real website is deployed and accessible

### Potential issues
- **`gh` CLI not authenticated**: Agent may need `gh auth login` first. If so, pre-authenticate on roberts-desktop: `gh auth login`
- **Vercel/Netlify CLI not installed**: Agent should install via `npm i -g vercel` or `npx`
- **Working directory**: Agent needs to `cd` to a working directory first. Suggest `/tmp/pop-agency` or `~/projects/pop-agency`
- **Agent max turns**: If the agent has `max_turns_per_run: 5`, it won't complete all tasks in one run. Increase to 30+ or use heartbeat for multiple runs.
- **Cost cap**: `max_cost_per_run: 0.50` should be sufficient for one run with ~20 tool calls

### Fallback if autonomous doesn't work
If the heartbeat trigger doesn't pick up tasks, use the Test panel with an explicit instruction telling the agent exactly what to do and in what order.

---

## Pre-flight checklist

- [ ] DevOps Agent has node grant for roberts-desktop with Shell, Git, Code capabilities
- [ ] DevOps Agent model is `claude-sonnet-4-20250514` (not `claude-sonnet-4-6`)
- [ ] DevOps Agent `max_turns_per_run` is >= 20
- [ ] `gh` CLI is authenticated on roberts-desktop (`gh auth status`)
- [ ] roberts-desktop daemon is online (check Daemons page)
- [ ] API embedding is working (Cohere primary or OpenAI restored)
- [ ] trix-bots is deployed with latest code (parallel context, capability registry)
