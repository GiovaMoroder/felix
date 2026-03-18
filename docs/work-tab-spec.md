# Work Tab Specification

## Data model

Three-tier hierarchy:

- Areas are top-level life domains (e.g. Career, Health, Life). They are never scheduled directly. They exist to group projects and give the agent context when reasoning about priorities.
- Projects belong to one area. Each project has: a name, an area, a priority level (set and updated by the agent, not manually), an optional soft deadline, a status (active / parked / done), and a "last worked on" date derived from calendar activity.
- Tasks belong to one project. Each task has: a name, an estimated duration in minutes, a status (todo / scheduled / overdue / done), and an optional linked calendar event. Tasks are the atomic unit the agent schedules.

## Layout

Three-column layout, mirroring the Calendar tab's overall shell:

- Left column — project sidebar (≈220px)
  - Lists all areas and their projects.
  - Each project shows a priority dot (red = high, amber = medium, green = low).
  - Clicking a project loads it in the main panel.
  - A "new project" button at the bottom opens a short agent-guided flow to name the project, assign it to an area, and optionally break it into first tasks.
- Center column — task list (flexible width)
  - Shows the selected project.
  - Header includes: project name, area, last worked on, soft deadline if set, and an agent-assigned status badge (Active / Neglected / On track / Parked).
  - Below the header, a flat list of tasks.
  - Each task row shows: checkbox, task name, scheduled pill (scheduled with date+time / unscheduled / overdue / done), and estimated duration.
  - Completed tasks are shown with reduced opacity at the bottom.
  - An "add task" affordance at the bottom of the list.
- Right column — agent panel (≈260px)
  - Always visible.
  - Contains three things stacked vertically: the agent's current assessment of the selected project (2–3 sentences, opinionated), one or more action cards, and a "Brainstorm with agent" button at the bottom that opens a conversational flow.

## Agent behaviors

### Passive monitoring

The agent continuously watches two things: whether active tasks on high-priority projects have a calendar slot within the next 7 days, and how long since any calendar block was completed for a project. If a project has unscheduled tasks or hasn't been touched in more than 5 days, it is marked Neglected and the agent queues a scheduling action.

### Schedule proposal

The agent's primary action. It analyzes unscheduled/overdue tasks across all active projects, cross-references free focus windows from the calendar (respecting existing blocks and the user's defined focus hours — Morning / Midday / Evening), and drafts a proposed weekly allocation.

The proposal is presented as a structured day-by-day view showing:

- time slot
- task name
- project
- duration

The user approves with one tap (commits all blocks to calendar), edits in natural language ("move Friday to Saturday morning"), or pushes back directionally ("too much interview prep, spread it out"). On approval, all blocks are written to the calendar silently.

The proposal always ends with an explicit callout of anything the agent couldn't resolve (e.g. a task that needs an external dependency, or a week with no free windows), with a specific question rather than a generic warning.

### Three daily touch points

- Morning (triggered on app open before noon, or at a configurable time): Agent checks overnight: what's on the calendar today, what's overdue, what high-priority project has no time blocked this week. Generates or refreshes a schedule proposal for the day and week. This is the primary planning interaction.
- During the day (passive, via calendar): Calendar blocks serve as the time tracker. No separate logging. When a block's time window passes, the agent marks the linked task as "completed today" if the user confirmed it (via a lightweight end-of-block prompt on the calendar side — a single "done / didn't do it" tap). This data feeds project "last worked on" and informs evening reflection.
- Evening (triggered on app open after 6pm, or at a configurable time): Agent compares what was scheduled today vs. what was actually completed. Surfaces a short reflection: which tasks got done, which were skipped. For each skipped task, the agent proposes a specific reschedule rather than just flagging it. Ends with a forward-looking note: what's already on deck for tomorrow.

### Priority management

Priority is agent-assigned and dynamic, not a manual field. The agent infers priority from: what the user has said in brainstorm conversations, recency of neglect, presence of a soft deadline, and how often the user has rescheduled or skipped a task. A project that is repeatedly deferred gets escalated. The agent surfaces this explicitly ("You've moved this task 3 times — should we park this project or do you want me to be more aggressive about protecting time for it?").

### Brainstorm flow

Accessible from the agent panel button. A conversational interface where the user and agent work through priorities together. The agent drives with hard questions: What does done look like for this project? Why hasn't this moved in 10 days? Is this still real or should we park it? The conversation always ends in a concrete decision: reprioritize, reschedule, park, or break into smaller tasks. The agent updates the project state and queues any scheduling actions that result.

## Agent panel — action card types

The right panel can show any of these card types depending on state:

- Scheduled — confirms what the agent has already committed to calendar for this project this week
- Unresolved — something the agent couldn't schedule, with a specific question and a CTA to resolve it
- Neglected alert — project hasn't been touched in N days, with a proposal CTA
- Proposal ready — a full schedule proposal is ready to review and commit
- Reflection — evening summary of what was done vs. skipped, with reschedule suggestions
- Agent's take — a standing opinion about the project or overall priority balance, updated after each brainstorm

## Integration with the Calendar tab

The two tabs share a single underlying data layer. Every task that gets scheduled creates a calendar event. Every calendar event tied to a task reports back its completion status. The Calendar tab's focus hour logic (Morning / Midday / Evening / Now) is what the agent uses to find available windows — it never schedules into protected focus blocks unless explicitly asked.

The "Today" panel on the calendar right sidebar should reflect work tasks alongside regular events — tasks scheduled for today appear there with their project context, not just as naked time blocks.
