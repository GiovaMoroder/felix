"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import type {
  DateSelectArg,
  DatesSetArg,
  EventChangeArg,
  EventClickArg,
  EventInput,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateClickArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  type CalendarEventRecord,
  updateCalendarEvent,
} from "@/features/calendar/lib/calendar-api";

type EventDraft = {
  id: string | null;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  allDay: boolean;
};

type EditorMode = "quick" | "full";
type AppTab = "work" | "calendar" | "jarvis";
type WorkProjectStatus = "active" | "parked" | "done";
type WorkPriority = "high" | "medium" | "low";
type WorkTaskStatus = "todo" | "scheduled" | "overdue" | "done";
type AgentCardTone = "accent" | "warn" | "danger" | "info";
type ChatRole = "agent" | "user";

type WorkTask = {
  id: string;
  name: string;
  estimateMinutes: number;
  status: WorkTaskStatus;
  scheduledLabel?: string;
};

type AgentChatMessage = {
  id: string;
  role: ChatRole;
  body: string;
  meta?: string;
};

type WorkProject = {
  id: string;
  name: string;
  areaId: string;
  priority: WorkPriority;
  status: WorkProjectStatus;
  softDeadline?: string;
  lastWorkedOn: string;
  agentStatus: "Active" | "Neglected" | "On track" | "Parked";
  assessment: string;
  tasks: WorkTask[];
};

type WorkArea = {
  id: string;
  name: string;
  projects: WorkProject[];
};

const WORK_AREAS: WorkArea[] = [
  {
    id: "career",
    name: "Career",
    projects: [
      {
        id: "career-interview-loop",
        name: "Interview Prep",
        areaId: "career",
        priority: "high",
        status: "active",
        softDeadline: "Apr 02",
        lastWorkedOn: "2 days ago",
        agentStatus: "Neglected",
        assessment:
          "This project matters, but the weekly plan is still too fragile. You have high-stakes tasks here and not enough protected time on the calendar yet.",
        tasks: [
          {
            id: "task-system-design",
            name: "Practice system design story",
            estimateMinutes: 90,
            status: "scheduled",
            scheduledLabel: "Thu 09:00",
          },
          {
            id: "task-mock-interview",
            name: "Run mock interview with scorecard",
            estimateMinutes: 60,
            status: "todo",
          },
          {
            id: "task-behavioral",
            name: "Rewrite behavioral answers",
            estimateMinutes: 45,
            status: "overdue",
          },
          {
            id: "task-company-brief",
            name: "Read company brief and notes",
            estimateMinutes: 30,
            status: "done",
          },
        ],
      },
      {
        id: "career-writing",
        name: "Writing System",
        areaId: "career",
        priority: "medium",
        status: "active",
        softDeadline: "Apr 15",
        lastWorkedOn: "Today",
        agentStatus: "On track",
        assessment:
          "This one is healthy. The next move is consistency, not urgency, so the plan should stay light and repeatable.",
        tasks: [
          {
            id: "task-outline",
            name: "Outline essay #3",
            estimateMinutes: 40,
            status: "scheduled",
            scheduledLabel: "Fri 12:30",
          },
          {
            id: "task-edit",
            name: "Edit previous draft",
            estimateMinutes: 35,
            status: "todo",
          },
          {
            id: "task-publish",
            name: "Publish and share notes",
            estimateMinutes: 20,
            status: "done",
          },
        ],
      },
    ],
  },
  {
    id: "health",
    name: "Health",
    projects: [
      {
        id: "health-strength",
        name: "Strength Reset",
        areaId: "health",
        priority: "low",
        status: "active",
        lastWorkedOn: "6 days ago",
        agentStatus: "Neglected",
        assessment:
          "This project is at risk of becoming symbolic. Either it needs smaller entry tasks or it needs one protected recurring slot that actually survives the week.",
        tasks: [
          {
            id: "task-gym-a",
            name: "Gym session A",
            estimateMinutes: 50,
            status: "todo",
          },
          {
            id: "task-gym-b",
            name: "Gym session B",
            estimateMinutes: 50,
            status: "todo",
          },
          {
            id: "task-mobility",
            name: "Mobility reset",
            estimateMinutes: 20,
            status: "done",
          },
        ],
      },
    ],
  },
  {
    id: "life",
    name: "Life",
    projects: [
      {
        id: "life-admin",
        name: "Home Admin Reset",
        areaId: "life",
        priority: "medium",
        status: "parked",
        lastWorkedOn: "11 days ago",
        agentStatus: "Parked",
        assessment:
          "Parking this is probably correct for now. If it becomes real again, the first step should be a tiny admin sweep rather than reopening the whole thing.",
        tasks: [
          {
            id: "task-bills",
            name: "Review recurring bills",
            estimateMinutes: 25,
            status: "todo",
          },
          {
            id: "task-docs",
            name: "Organize insurance docs",
            estimateMinutes: 30,
            status: "done",
          },
        ],
      },
    ],
  },
];

const WORK_CHAT_SEED: AgentChatMessage[] = [
  {
    id: "seed-1",
    role: "agent",
    meta: "Morning check-in",
    body:
      "Interview Prep is still the project most at risk. It has the highest urgency, but the week is not yet protected enough for it.",
  },
  {
    id: "seed-2",
    role: "user",
    body: "I want the plan to be realistic. Do not overload the week just because something is important.",
  },
  {
    id: "seed-3",
    role: "agent",
    meta: "Proposal ready",
    body:
      "Then the right move is to protect fewer blocks and make them survive. I would rather fully protect three credible sessions than draft seven that get renegotiated away.",
  },
];

const WORK_CHAT_PROMPTS = [
  "What should I focus on this week?",
  "Review the schedule proposal",
  "Should we park something?",
  "Break this into smaller tasks",
];

export function CalendarShell() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const jarvisThreadRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("calendar");
  const [selectedDate, setSelectedDate] = useState(new Date("2026-03-18T09:00:00"));
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("quick");
  const [eventDraft, setEventDraft] = useState<EventDraft>(emptyDraft("2026-03-18"));
  const [events, setEvents] = useState<EventInput[]>([]);
  const [currentRange, setCurrentRange] = useState<{ start: string; end: string } | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(WORK_AREAS[0].projects[0].id);
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([
    WORK_AREAS[0].projects[0].id,
  ]);
  const [chatInput, setChatInput] = useState("");
  const [workChat, setWorkChat] = useState<AgentChatMessage[]>(WORK_CHAT_SEED);

  const selectedProject =
    WORK_AREAS.flatMap((area) => area.projects).find((project) => project.id === selectedProjectId) ??
    WORK_AREAS[0].projects[0];
  const visibleProjects =
    WORK_AREAS.flatMap((area) => area.projects).filter((project) =>
      selectedProject.areaId ? project.areaId === selectedProject.areaId : true,
    );

  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
  const leadingPadding = (monthStart.getDay() + 6) % 7;
  const totalCells = Math.ceil((leadingPadding + monthEnd.getDate()) / 7) * 7;
  const miniCalendarDays = Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - leadingPadding + 1;
    if (dayNumber < 1 || dayNumber > monthEnd.getDate()) {
      return null;
    }

    return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), dayNumber);
  });

  function syncCalendarDate(date: Date) {
    const api = calendarRef.current?.getApi();
    if (!api) {
      return;
    }

    api.gotoDate(date);
    setSelectedDate(date);
  }

  function shiftMiniCalendar(monthOffset: number) {
    const nextDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth() + monthOffset,
      1,
    );
    syncCalendarDate(nextDate);
  }

  function scrollCalendarToTime(time: string) {
    const api = calendarRef.current?.getApi();
    if (!api) {
      return;
    }

    api.scrollToTime(time);
  }

  function toggleProjectExpansion(projectId: string) {
    setExpandedProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  }

  function appendChatMessage(message: AgentChatMessage) {
    setWorkChat((current) => [...current, message]);
  }

  function sendChatMessage(body: string) {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }

    appendChatMessage({
      id: `user-${Date.now()}`,
      role: "user",
      body: trimmed,
    });

    appendChatMessage({
      id: `agent-${Date.now() + 1}`,
      role: "agent",
      meta: `${selectedProject.name} context`,
      body: buildAgentReply(selectedProject, trimmed),
    });

    setChatInput("");
  }

  useEffect(() => {
    if (!isCreateModalOpen) {
      return;
    }

    const currentDate = toDateInputValue(selectedDate);
    setEventDraft((draft) => ({ ...draft, date: draft.date || currentDate }));
  }, [isCreateModalOpen, selectedDate]);

  useEffect(() => {
    if (!currentRange) {
      return;
    }

    let cancelled = false;
    setIsLoadingEvents(true);
    setCalendarError(null);

    fetchCalendarEvents(currentRange.start, currentRange.end)
      .then((records) => {
        if (cancelled) {
          return;
        }
        setEvents(records.map(toCalendarInput));
      })
      .catch((error: Error) => {
        if (cancelled) {
          return;
        }
        setCalendarError(error.message);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingEvents(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentRange]);

  useEffect(() => {
    if (activeTab !== "jarvis") {
      return;
    }

    const thread = jarvisThreadRef.current;
    if (!thread) {
      return;
    }

    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: "smooth",
    });
  }, [activeTab, workChat]);

  function openCreateModal() {
    setEventDraft(emptyDraft(toDateInputValue(selectedDate)));
    setEditorMode("quick");
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setEditorMode("quick");
    calendarRef.current?.getApi().unselect();
  }

  function handleDraftChange<K extends keyof EventDraft>(field: K, value: EventDraft[K]) {
    setEventDraft((draft) => ({ ...draft, [field]: value }));
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = eventDraft.title.trim();
    if (!title) {
      setCalendarError("Event title is required.");
      return;
    }

    const { start, end } = buildDraftRange(eventDraft);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setCalendarError("End time must be after start time.");
      return;
    }

    const payload = {
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      notes: eventDraft.notes.trim() || null,
      all_day: eventDraft.allDay,
    };

    try {
      let saved: CalendarEventRecord;
      if (eventDraft.id) {
        saved = await updateCalendarEvent(eventDraft.id, payload);
        setEvents((current) =>
          current.map((calendarEvent) =>
            calendarEvent.id === saved.id ? toCalendarInput(saved) : calendarEvent,
          ),
        );
      } else {
        saved = await createCalendarEvent(payload);
        setEvents((current) => [...current, toCalendarInput(saved)]);
      }

      calendarRef.current?.getApi().gotoDate(saved.start);
      setSelectedDate(new Date(saved.start));
      setCalendarError(null);
      setIsCreateModalOpen(false);
      setEventDraft(emptyDraft(toDateInputValue(new Date(saved.start))));
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : "Unable to save event.");
    }
  }

  async function handleDeleteEvent() {
    if (!eventDraft.id) {
      return;
    }

    try {
      await deleteCalendarEvent(eventDraft.id);
      setEvents((current) => current.filter((event) => event.id !== eventDraft.id));
      setCalendarError(null);
      closeCreateModal();
      setEventDraft(emptyDraft(toDateInputValue(selectedDate)));
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : "Unable to delete event.");
    }
  }

  function handleDatesSet(info: DatesSetArg) {
    setSelectedDate(info.view.calendar.getDate());
    setCurrentRange({
      start: info.start.toISOString(),
      end: info.end.toISOString(),
    });
  }

  function handleEventClick(info: EventClickArg) {
    const clicked = info.event;
    openEventEditor({
      id: clicked.id,
      title: clicked.title,
      start: clicked.start ?? new Date(),
      end: clicked.end ?? clicked.start ?? new Date(),
      notes: String(clicked.extendedProps.notes ?? ""),
      allDay: clicked.allDay,
    });
  }

  function handleDateClick(info: DateClickArg) {
    openEventEditor({
      id: null,
      title: "",
      start: info.date,
      end: addHour(info.date),
      notes: "",
      allDay: info.allDay,
    });
  }

  function handleSelect(selection: DateSelectArg) {
    openEventEditor({
      id: null,
      title: "",
      start: selection.start,
      end: selection.end,
      notes: "",
      allDay: selection.allDay,
    });
  }

  async function handleEventChange(arg: EventChangeArg | EventResizeDoneArg) {
    const changed = arg.event;
    const previous = "oldEvent" in arg ? arg.oldEvent : null;

    try {
      const saved = await updateCalendarEvent(changed.id, {
        start: changed.start?.toISOString(),
        end: (changed.end ?? changed.start)?.toISOString(),
        all_day: changed.allDay,
      });
      setEvents((current) =>
        current.map((event) => (event.id === saved.id ? toCalendarInput(saved) : event)),
      );
      setCalendarError(null);
    } catch (error) {
      arg.revert();
      if (previous) {
        setSelectedDate(previous.start ?? selectedDate);
      }
      setCalendarError(error instanceof Error ? error.message : "Unable to update event.");
    }
  }

  function openEventEditor(input: {
    id: string | null;
    title: string;
    start: Date;
    end: Date;
    notes: string;
    allDay: boolean;
  }) {
    setEventDraft({
      id: input.id,
      title: input.title,
      date: toDateInputValue(input.start),
      startTime: input.allDay ? "00:00" : toTimeInputValue(input.start),
      endTime: input.allDay ? "00:00" : toTimeInputValue(input.end),
      notes: input.notes,
      allDay: input.allDay,
    });
    setEditorMode("quick");
    setIsCreateModalOpen(true);
    setCalendarError(null);
  }

  return (
    <>
      <main className="app-shell" data-active-tab={activeTab}>
        <div className="workspace">
          <div className="topbar-shell">
            <div className="topbar">
              <div className="brand">Productivity Agent</div>
              <nav className="nav-group" aria-label="Primary navigation">
                <button
                  className="nav-item"
                  data-active={activeTab === "work"}
                  type="button"
                  onClick={() => setActiveTab("work")}
                >
                  Work
                </button>
                <button
                  className="nav-item"
                  data-active={activeTab === "calendar"}
                  type="button"
                  onClick={() => setActiveTab("calendar")}
                >
                  Calendar
                </button>
                <button
                  className="nav-item"
                  data-active={activeTab === "jarvis"}
                  type="button"
                  onClick={() => setActiveTab("jarvis")}
                >
                  Jarvis
                </button>
              </nav>
            </div>
          </div>

          {activeTab === "work" ? (
            <div className="three-column-layout three-column-layout-work">
              <aside className="left-rail">
                <div className="left-stack work-left-stack">
                  <section className="panel-card work-sidebar">
                    <p className="section-title">Areas</p>
                    <div className="area-list">
                      {WORK_AREAS.map((area) => (
                        <section key={area.id} className="area-section">
                          <p className="area-title">{area.name}</p>
                          <div className="project-list">
                            {area.projects.map((project) => (
                              <button
                                key={project.id}
                                type="button"
                                className="project-nav-item"
                                data-active={project.id === selectedProject.id || undefined}
                                onClick={() => setSelectedProjectId(project.id)}
                              >
                                <span
                                  className="priority-dot"
                                  data-priority={project.priority}
                                  aria-hidden="true"
                                />
                                <span className="project-nav-copy">
                                  <span className="project-nav-name">{project.name}</span>
                                  <span className="project-nav-meta">
                                    {toProjectLabel(project.status)} · {project.lastWorkedOn}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                    <button className="ghost-button full-width-button" type="button">
                      New project
                    </button>
                  </section>
                </div>
              </aside>

              <section className="calendar-card main-column work-main-column">
                <div className="work-project-stream">
                  <div className="work-task-list-header">
                    <p className="section-title">
                      {areaNameForId(selectedProject.areaId)} projects
                    </p>
                    <span className="task-count">{visibleProjects.length} projects</span>
                  </div>

                  {visibleProjects.map((project) => {
                    const isExpanded = expandedProjectIds.includes(project.id);
                    const openTasks = project.tasks.filter((task) => task.status !== "done");
                    const doneTasks = project.tasks.filter((task) => task.status === "done");

                    return (
                      <section
                        key={project.id}
                        className="project-accordion-card"
                        data-active={project.id === selectedProject.id || undefined}
                      >
                        <button
                          type="button"
                          className="project-accordion-header"
                          onClick={() => {
                            setSelectedProjectId(project.id);
                            toggleProjectExpansion(project.id);
                          }}
                        >
                          <div className="project-accordion-title-row">
                            <div className="project-accordion-name-wrap">
                              <span
                                className="priority-dot"
                                data-priority={project.priority}
                                aria-hidden="true"
                              />
                              <h2 className="project-accordion-title">{project.name}</h2>
                            </div>
                            <span
                              className="status-badge"
                              data-tone={toneForAgentStatus(project.agentStatus)}
                            >
                              {project.agentStatus}
                            </span>
                          </div>

                          <div className="project-accordion-meta">
                            <span>{areaNameForId(project.areaId)}</span>
                            <span>Last worked: {project.lastWorkedOn}</span>
                            <span>Deadline: {project.softDeadline ?? "None"}</span>
                            <span>{openTasks.length} open tasks</span>
                          </div>
                        </button>

                        {isExpanded ? (
                          <div className="project-accordion-body">
                            <div className="task-list-group">
                              {openTasks.map((task) => (
                                <div key={task.id} className="task-row">
                                  <label className="task-checkbox">
                                    <input type="checkbox" disabled={task.status === "done"} />
                                  </label>
                                  <div className="task-copy">
                                    <p className="task-name">{task.name}</p>
                                  </div>
                                  <span className="task-pill" data-state={task.status}>
                                    {task.status === "scheduled"
                                      ? `Scheduled · ${task.scheduledLabel}`
                                      : task.status === "overdue"
                                        ? "Overdue"
                                        : "Unscheduled"}
                                  </span>
                                  <span className="task-duration">{task.estimateMinutes} min</span>
                                </div>
                              ))}
                            </div>

                            {doneTasks.length ? (
                              <div className="task-list-complete">
                                {doneTasks.map((task) => (
                                  <div key={task.id} className="task-row task-row-done">
                                    <label className="task-checkbox">
                                      <input type="checkbox" checked readOnly />
                                    </label>
                                    <div className="task-copy">
                                      <p className="task-name">{task.name}</p>
                                    </div>
                                    <span className="task-pill" data-state="done">Done</span>
                                    <span className="task-duration">{task.estimateMinutes} min</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            <button className="ghost-button add-task-button" type="button">
                              Add task
                            </button>
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              </section>

              <aside className="right-rail">
                <div className="right-stack work-right-stack">
                  <section className="panel-card work-agent-panel">
                    <div className="agent-panel-section">
                      <p className="coach-label">Agent Assessment</p>
                      <div className="coach-bubble">{selectedProject.assessment}</div>
                    </div>

                    <div className="agent-panel-section">
                      <p className="section-title">Suggested next moves</p>
                      <button className="ghost-button full-width-button" type="button">
                        Review schedule proposal
                      </button>
                      <button className="ghost-button full-width-button" type="button">
                        Break into smaller tasks
                      </button>
                    </div>

                    <button
                      className="primary-button full-width-button"
                      type="button"
                      onClick={() => setActiveTab("jarvis")}
                    >
                      Open in Jarvis
                    </button>
                  </section>
                </div>
              </aside>
            </div>
          ) : activeTab === "jarvis" ? (
            <div className="jarvis-layout">
              <aside className="jarvis-sidebar">
                <section className="jarvis-tree">
                  <div className="jarvis-tree-scroll">
                    {WORK_AREAS.map((area) => (
                      <section key={area.id} className="area-section">
                        <p className="area-title">{area.name}</p>
                        <div className="project-list">
                          {area.projects.map((project) => (
                            <div
                              key={project.id}
                              className="jarvis-tree-project"
                              data-active={project.id === selectedProject.id || undefined}
                            >
                              <div className="jarvis-project-header">
                                <button
                                  type="button"
                                  className="project-nav-item jarvis-project-button"
                                  data-active={project.id === selectedProject.id || undefined}
                                  onClick={() => setSelectedProjectId(project.id)}
                                >
                                  <span
                                    className="priority-dot"
                                    data-priority={project.priority}
                                    aria-hidden="true"
                                  />
                                  <span className="project-nav-copy">
                                    <span className="project-nav-name">{project.name}</span>
                                    <span className="project-nav-meta">
                                      {project.agentStatus} · {project.lastWorkedOn}
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="jarvis-collapse-button"
                                  onClick={() => toggleProjectExpansion(project.id)}
                                  aria-label={
                                    expandedProjectIds.includes(project.id)
                                      ? `Collapse ${project.name}`
                                      : `Expand ${project.name}`
                                  }
                                >
                                  {expandedProjectIds.includes(project.id) ? "−" : "+"}
                                </button>
                              </div>
                              {expandedProjectIds.includes(project.id) ? (
                                <div className="jarvis-task-tree">
                                  {project.tasks.map((task) => (
                                    <div key={task.id} className="jarvis-task-node" data-state={task.status}>
                                      <span className="jarvis-task-bullet" aria-hidden="true" />
                                      <span className="jarvis-task-label">{task.name}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              </aside>

              <section className="jarvis-main">
                <div className="jarvis-stage">
                  <div ref={jarvisThreadRef} className="jarvis-chat-thread">
                    {workChat.map((message) =>
                      message.role === "user" ? (
                        <article key={message.id} className="chat-message" data-role="user">
                          <div className="chat-bubble">
                            <p className="chat-message-body">{message.body}</p>
                          </div>
                        </article>
                      ) : (
                        <article key={message.id} className="chat-message" data-role="agent">
                          <div className="chat-message-head">
                            <span />
                            {message.meta ? (
                              <span className="chat-message-meta">{message.meta}</span>
                            ) : null}
                          </div>
                          <p className="chat-message-body">{message.body}</p>
                        </article>
                      ),
                    )}
                  </div>

                  <div className="chat-quick-prompts jarvis-prompts">
                    {WORK_CHAT_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        className="ghost-button chat-prompt-chip"
                        type="button"
                        onClick={() => sendChatMessage(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  <form
                    className="jarvis-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      sendChatMessage(chatInput);
                    }}
                  >
                    <textarea
                      className="field-input jarvis-input"
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder="Message Jarvis"
                      rows={1}
                    />
                    <button className="primary-button jarvis-send-button" type="submit">
                      Send
                    </button>
                  </form>
                </div>
              </section>
            </div>
          ) : (
            <div className="three-column-layout">
              <aside className="left-rail">
                <div className="left-stack">
                  <section className="panel-card mini-calendar">
                    <div className="mini-calendar-header">
                      <p className="rail-title">
                        {selectedDate.toLocaleString("en-US", {
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      <div className="mini-calendar-controls">
                        <button
                          className="mini-calendar-button"
                          type="button"
                          onClick={() => shiftMiniCalendar(-1)}
                          aria-label="Previous month"
                        >
                          ←
                        </button>
                        <button
                          className="mini-calendar-button"
                          type="button"
                          onClick={() => shiftMiniCalendar(1)}
                          aria-label="Next month"
                        >
                          →
                        </button>
                      </div>
                    </div>
                    <div className="mini-calendar-grid">
                      <div className="mini-weekday">M</div>
                      <div className="mini-weekday">T</div>
                      <div className="mini-weekday">W</div>
                      <div className="mini-weekday">T</div>
                      <div className="mini-weekday">F</div>
                      <div className="mini-weekday">S</div>
                      <div className="mini-weekday">S</div>
                      {miniCalendarDays.map((day, index) => {
                        const label = day?.getDate() ?? "";
                        const isActive =
                          day !== null &&
                          day.toDateString() === selectedDate.toDateString();

                        return (
                          <button
                            key={day?.toISOString() ?? `empty-${index}`}
                            type="button"
                            className="mini-cell"
                            data-active={isActive || undefined}
                            data-empty={day === null || undefined}
                            onClick={() => day && syncCalendarDate(day)}
                            disabled={day === null}
                            aria-label={day ? day.toDateString() : "Empty day"}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="panel-card">
                    <p className="coach-label">AI Coach</p>
                    <div className="coach-bubble">
                      Real calendar mechanics first. The assistant should protect focus blocks,
                      not create more activity around them.
                    </div>
                  </section>
                </div>
              </aside>

              <section className="calendar-card main-column">
                <div className="calendar-focus-bar" aria-label="Calendar focus shortcuts">
                  <p className="section-title">Focus Hours</p>
                  <div className="focus-chip-row">
                    <button
                      className="ghost-button focus-chip"
                      type="button"
                      onClick={() => scrollCalendarToTime(currentTimeScrollTarget())}
                    >
                      Now
                    </button>
                    <button
                      className="ghost-button focus-chip"
                      type="button"
                      onClick={() => scrollCalendarToTime("08:00:00")}
                    >
                      Morning
                    </button>
                    <button
                      className="ghost-button focus-chip"
                      type="button"
                      onClick={() => scrollCalendarToTime("12:00:00")}
                    >
                      Midday
                    </button>
                    <button
                      className="ghost-button focus-chip"
                      type="button"
                      onClick={() => scrollCalendarToTime("18:00:00")}
                    >
                      Evening
                    </button>
                  </div>
                </div>

                {(calendarError || isLoadingEvents) ? (
                  <div className="status-row">
                    {isLoadingEvents ? (
                      <span className="status-item status-item-loading">Loading events…</span>
                    ) : null}
                    {calendarError ? <span>{calendarError}</span> : null}
                  </div>
                ) : null}

                <div className="calendar-frame">
                  <FullCalendar
                    ref={calendarRef}
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="timeGridWeek"
                    initialDate={selectedDate}
                    headerToolbar={{
                      left: "prev,next today newEvent",
                      center: "title",
                      right: "dayGridMonth,timeGridWeek,timeGridDay",
                    }}
                    customButtons={{
                      newEvent: {
                        text: "New event",
                        click: openCreateModal,
                      },
                    }}
                    editable
                    selectable
                    selectMirror
                    nowIndicator
                    allDaySlot
                    slotDuration="01:00:00"
                    slotLabelInterval="01:00:00"
                    snapDuration="00:15:00"
                    slotMinTime="00:00:00"
                    slotMaxTime="24:00:00"
                    scrollTime="09:00:00"
                    scrollTimeReset
                    events={events}
                    eventClick={handleEventClick}
                    dateClick={handleDateClick}
                    select={handleSelect}
                    eventDrop={handleEventChange}
                    eventResize={handleEventChange}
                    height="78vh"
                    datesSet={handleDatesSet}
                  />
                </div>
              </section>

              <aside className="right-rail">
                <div className="right-stack">
                  <section className="command-card">
                    <p className="section-title">Command</p>
                    <input
                      className="command-input"
                      defaultValue="Move the doctor appointment to tomorrow at 11."
                      aria-label="Natural language command"
                    />
                  </section>

                  <section className="context-card">
                    <p className="section-title">Today</p>
                    <div className="context-list">
                      <div className="context-item">
                        <strong>Protect 10:00 to 12:00</strong>
                        <p>
                          This is your cleanest focus window. Keep meetings out unless the cost is real.
                        </p>
                      </div>
                      <div className="context-item">
                        <strong>One unscheduled priority</strong>
                        <p>Convert “Draft weekly review” into a 45 minute block this afternoon.</p>
                      </div>
                    </div>
                  </section>
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>

      {isCreateModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeCreateModal}>
          <div
            className={`modal-panel ${editorMode === "quick" ? "modal-panel-quick" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-event-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Calendar</p>
                <h2 id="create-event-title" className="modal-title">
                  {eventDraft.id ? "Edit event" : "Create event"}
                </h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeCreateModal}>
                Close
              </button>
            </div>

            <form className="event-form" onSubmit={handleCreateEvent}>
              <label className="field">
                <span className="field-label">Title</span>
                <input
                  className="field-input"
                  value={eventDraft.title}
                  onChange={(event) => handleDraftChange("title", event.target.value)}
                  placeholder="Deep work block"
                  required
                />
              </label>

              {editorMode === "quick" ? (
                <>
                  <div className="field-row">
                    <label className="field">
                      <span className="field-label">Date</span>
                      <input
                        className="field-input"
                        type="date"
                        value={eventDraft.date}
                        onChange={(event) => handleDraftChange("date", event.target.value)}
                        required
                      />
                    </label>

                    <label className="checkbox-field quick-checkbox">
                      <input
                        type="checkbox"
                        checked={eventDraft.allDay}
                        onChange={(event) => handleDraftChange("allDay", event.target.checked)}
                      />
                      <span>All day</span>
                    </label>
                  </div>

                  <div className="field-row">
                    <label className="field">
                      <span className="field-label">Start</span>
                      <input
                        className="field-input"
                        type="time"
                        value={eventDraft.startTime}
                        onChange={(event) => handleDraftChange("startTime", event.target.value)}
                        required
                        disabled={eventDraft.allDay}
                      />
                    </label>

                    <label className="field">
                      <span className="field-label">End</span>
                      <input
                        className="field-input"
                        type="time"
                        value={eventDraft.endTime}
                        onChange={(event) => handleDraftChange("endTime", event.target.value)}
                        required
                        disabled={eventDraft.allDay}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <label className="field">
                    <span className="field-label">Date</span>
                    <input
                      className="field-input"
                      type="date"
                      value={eventDraft.date}
                      onChange={(event) => handleDraftChange("date", event.target.value)}
                      required
                    />
                  </label>

                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={eventDraft.allDay}
                      onChange={(event) => handleDraftChange("allDay", event.target.checked)}
                    />
                    <span>All day</span>
                  </label>

                  <div className="field-row">
                    <label className="field">
                      <span className="field-label">Start</span>
                      <input
                        className="field-input"
                        type="time"
                        value={eventDraft.startTime}
                        onChange={(event) => handleDraftChange("startTime", event.target.value)}
                        required
                        disabled={eventDraft.allDay}
                      />
                    </label>

                    <label className="field">
                      <span className="field-label">End</span>
                      <input
                        className="field-input"
                        type="time"
                        value={eventDraft.endTime}
                        onChange={(event) => handleDraftChange("endTime", event.target.value)}
                        required
                        disabled={eventDraft.allDay}
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span className="field-label">Notes</span>
                    <textarea
                      className="field-input field-textarea"
                      value={eventDraft.notes}
                      onChange={(event) => handleDraftChange("notes", event.target.value)}
                      placeholder="Optional context, location, or agenda"
                      rows={4}
                    />
                  </label>
                </>
              )}

              <div className="modal-actions">
                {eventDraft.id ? (
                  <button className="danger-button" type="button" onClick={handleDeleteEvent}>
                    Delete
                  </button>
                ) : null}
                {editorMode === "quick" ? (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => setEditorMode("full")}
                  >
                    More options
                  </button>
                ) : null}
                <button className="ghost-button" type="button" onClick={closeCreateModal}>
                  Cancel
                </button>
                <button className="primary-button" type="submit">
                  {eventDraft.id ? "Save changes" : "Create event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function areaNameForId(areaId: string): string {
  return WORK_AREAS.find((area) => area.id === areaId)?.name ?? "Unknown";
}

function toProjectLabel(status: WorkProjectStatus): string {
  if (status === "active") {
    return "Active";
  }

  if (status === "parked") {
    return "Parked";
  }

  return "Done";
}

function toneForAgentStatus(status: WorkProject["agentStatus"]): AgentCardTone {
  if (status === "Neglected") {
    return "danger";
  }

  if (status === "On track") {
    return "accent";
  }

  if (status === "Parked") {
    return "info";
  }

  return "warn";
}

function buildAgentReply(project: WorkProject, prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes("park")) {
    return `If we park ${project.name}, I would keep one tiny re-entry task and remove the rest from this week. That reduces guilt and makes the decision real.`;
  }

  if (lowerPrompt.includes("schedule") || lowerPrompt.includes("time")) {
    return `For ${project.name}, I would place the hardest task in a Morning window, then use one shorter Midday block for cleanup work. That keeps the plan credible instead of crowded.`;
  }

  if (lowerPrompt.includes("smaller") || lowerPrompt.includes("break")) {
    return `I would split the next step into two pieces under 30 minutes each. Right now the project is paying a startup cost every time you look at it.`;
  }

  return `My take on ${project.name}: protect the next meaningful step, not the entire ambition. The plan should feel slightly firm, not heroic.`;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function emptyDraft(date: string): EventDraft {
  return {
    id: null,
    title: "",
    date,
    startTime: "11:00",
    endTime: "12:00",
    notes: "",
    allDay: false,
  };
}

function currentTimeScrollTarget(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}:00`;
}

function addHour(date: Date): Date {
  const next = new Date(date);
  next.setHours(next.getHours() + 1);
  return next;
}

function toCalendarInput(record: CalendarEventRecord): EventInput {
  return {
    id: record.id,
    title: record.title,
    start: record.start,
    end: record.end,
    allDay: record.all_day,
    extendedProps: {
      notes: record.notes,
    },
  };
}

function buildDraftRange(draft: EventDraft): { start: Date; end: Date } {
  if (draft.allDay) {
    const start = new Date(`${draft.date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  return {
    start: new Date(`${draft.date}T${draft.startTime}:00`),
    end: new Date(`${draft.date}T${draft.endTime}:00`),
  };
}
