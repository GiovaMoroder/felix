# Agno Agent

This folder contains the Agno-based implementation of the planning agent used by the planning service.

At a high level, this layer takes a structured `AgentRequest`, routes it to the most relevant specialist agent, lets that specialist call local planning tools, and then returns a structured `AgentResponse` that the frontend can render in the Work and Jarvis views.

## Why This Exists

The rest of the planning service already has application use cases, database models, and API routes. The Agno layer sits on top of those pieces and gives the app a flexible LLM-powered orchestration layer without forcing the frontend to deal with raw model output.

This gives the project a few useful properties:

- the frontend always receives a predictable response shape
- tool access is limited to explicit calendar, planning, and coaching capabilities
- routing between different kinds of user requests is handled inside one team
- write operations can be guided by instructions like "only mutate when the user clearly asked"

## Where It Fits

The request flow looks like this:

1. The frontend sends a message to `POST /api/agent/respond`.
2. `interfaces/api/agent.py` creates a `PlanningAgentRuntime`.
3. `agent/runtime.py` delegates to `AgnoPlanningAgentRuntime`.
4. `agent/agno/runtime.py` builds a prompt from the structured request context.
5. `agent/agno/team.py` creates an Agno `Team` with three specialists.
6. The selected specialist uses tools from `agent/agno/tools.py`.
7. The Agno output is normalized into the shared `AgentResponse` schema.

That means this folder is not an isolated chatbot experiment. It is the production orchestration layer that sits between the API and the domain/application code.

## Files

- `runtime.py`: adapter between the app's request/response models and Agno's runtime
- `team.py`: team construction, model setup, specialist definitions, and routing instructions
- `models.py`: structured output schema that Agno is expected to return
- `tools.py`: tool builders that expose calendar, planning, and coaching capabilities to the specialists
- `__init__.py`: package marker

## The Three Specialists

The Agno team is configured in route mode and contains three members:

- `CalendarAgent`: handles event lookup, event creation, event updates, deletion, and free-window checks
- `PlanningAgent`: inspects projects, builds schedule proposals, and can commit those proposals when explicitly approved
- `CoachingAgent`: handles prioritization, neglected-project guidance, parking work, and lightweight strategic advice

The team-level router is model-driven. The team receives the user message plus request context and decides which specialist should respond. Each specialist also gets its own instructions so the routing decision and the behavior after routing both stay constrained.

## Runtime Responsibilities

`runtime.py` does four important jobs:

### 1. Build the model prompt

The runtime converts `AgentRequest` into a plain-text payload that includes:

- the user's message
- selected project id, if present
- current datetime
- user timezone
- currently visible calendar range
- whether the user explicitly approved a commit or mutation

This is especially important for relative dates like "tomorrow", "this week", or "next Friday". The prompt explicitly tells the model to resolve those phrases against the provided datetime and timezone instead of guessing.

### 2. Run the team

The runtime constructs the Agno team through `build_agent_team(session)` and calls `team.run(payload)`.

### 3. Normalize output

The code accepts several possible return shapes from Agno:

- an `AgnoAgentOutput` instance
- another Pydantic model
- a dictionary
- a dataclass
- unstructured fallback content

If the model returns something unexpected, the runtime still produces a valid fallback response instead of crashing the API.

### 4. Translate to app-level models

The planning service does not expose Agno-specific models directly. The runtime maps `AgnoAgentOutput` into the shared `AgentResponse` format used elsewhere in the service and by the frontend.

## Structured Output Contract

`models.py` defines the schema Agno should return:

- `route`: one of `calendar`, `planning`, or `coaching`
- `summary`: the main user-facing answer
- `rationale`: why the agent chose that answer
- `insights`: extra observations for the UI
- `actions`: suggested next actions the frontend can render as buttons
- `data`: structured payload such as proposal blocks, project ids, or event counts

This contract matters because the frontend is not just showing plain text. It can also:

- render insight cards
- show suggested follow-up actions
- preview schedule proposals
- trigger project-opening or proposal-review flows

## Tools Exposed To The Model

The tools in `tools.py` are the main boundary between the model and the rest of the application.

### Calendar tools

These let the calendar specialist:

- list upcoming events
- create an event
- update an event
- delete an event
- find free business-hour windows

The write tools ultimately call the existing calendar use cases, so the Agno layer is not bypassing domain logic.

### Planning tools

These let the planning specialist:

- list the top work projects
- inspect a single project
- build a schedule proposal
- break a task into smaller tasks

The key safety rule here is that schedule proposals should be built with `commit=False` unless the user clearly approved applying them.

### Coaching tools

These let the coaching specialist:

- assess project priorities
- find neglected projects
- park a project
- raise a project's priority

These are intentionally narrower and more opinionated. The coaching agent is meant to guide decisions, not act like a generic assistant with unlimited access.

## Model Configuration

All specialists share the same OpenAI-compatible model setup from `team.py`:

- model id comes from `OPENAI_MODEL`
- API key comes from `OPENAI_API_KEY`
- optional base URL comes from `OPENAI_BASE_URL`
- temperature is set to `0.2` to keep responses more stable and less improvisational

Configuration is loaded through `productivity_agent.infrastructure.settings.get_openai_settings()`.

## Safety And Product Rules

The instructions in `team.py` encode a few core behavior rules:

- only perform writes when the user clearly asked for them
- build plans before committing them
- default general conversation to coaching
- resolve relative dates using the provided request context
- keep routes constrained to `calendar`, `planning`, or `coaching`

Those rules are worth preserving when editing this layer because they directly shape user trust and product behavior.

## Extending The Agno Agent

If you want to add a new behavior, the usual path is:

1. Add or reuse domain/application logic outside this folder.
2. Expose that behavior through a narrowly scoped tool in `tools.py`.
3. Update the relevant specialist instructions in `team.py`.
4. Extend `models.py` only if the frontend needs additional structured output.
5. Keep `runtime.py` responsible for normalization and translation, not business logic.

This separation helps prevent the agent layer from turning into a second application backend with duplicated logic.

## Practical Example

For a request like "Plan my interview prep for this week":

1. The frontend sends the message, selected project id, current time, timezone, and visible calendar range.
2. The Agno team routes the request to `PlanningAgent`.
3. The planning specialist may inspect the project and call `build_project_schedule(commit=False)`.
4. It returns a structured response with:
   a summary for the user,
   optional insight cards,
   an action like "review proposal",
   and proposal blocks in `data.blocks`.
5. The frontend renders the proposal preview and can later send an explicit commit request if the user approves it.

That pattern is the core idea of this folder: use LLM routing and reasoning, but keep the final application behavior structured, inspectable, and controllable.
