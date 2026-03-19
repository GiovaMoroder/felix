"use client";

import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
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
import {
  breakDownWorkTask,
  createWorkProject,
  createWorkTask,
  deleteWorkProject,
  deleteWorkTask,
  type AgentAction,
  type AgentInsight,
  type AgentResponse,
  fetchWorkAreas,
  requestScheduleProposal,
  respondToAgent,
  type ScheduleProposal,
  type WorkAreaRecord,
  type WorkProjectRecord,
  type WorkTaskRecord,
  updateWorkProject,
  updateWorkTask,
} from "@/features/calendar/lib/work-api";

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
type AgentCardTone = "accent" | "warn" | "danger" | "info";
type ChatRole = "agent" | "user";

type AgentChatMessage = {
  id: string;
  role: ChatRole;
  body: string;
  meta?: string;
  insights?: AgentInsight[];
  actions?: AgentAction[];
  proposal?: ScheduleProposal | null;
};

type ProjectModalState = {
  mode: "create" | "edit";
  projectId: string | null;
  name: string;
  areaId: string;
  softDeadline: string;
};

type TaskModalState = {
  mode: "create" | "edit";
  projectId: string;
  taskId: string | null;
  name: string;
  estimateMinutes: string;
};

type ContextMenuState =
  | {
      kind: "project";
      id: string;
      projectId: string;
      x: number;
      y: number;
    }
  | {
      kind: "task";
      id: string;
      projectId: string;
      x: number;
      y: number;
    };

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
  const [workAreas, setWorkAreas] = useState<WorkAreaRecord[]>([]);
  const [isLoadingWork, setIsLoadingWork] = useState(true);
  const [workError, setWorkError] = useState<string | null>(null);
  const [workNotice, setWorkNotice] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);
  const [scheduleProposal, setScheduleProposal] = useState<ScheduleProposal | null>(null);
  const [projectModal, setProjectModal] = useState<ProjectModalState | null>(null);
  const [taskModal, setTaskModal] = useState<TaskModalState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [workChat, setWorkChat] = useState<AgentChatMessage[]>([]);
  const [isSendingChat, setIsSendingChat] = useState(false);

  const allProjects = workAreas.flatMap((area) => area.projects);
  const selectedProject =
    allProjects.find((project) => project.id === selectedProjectId) ?? allProjects[0] ?? null;
  const visibleProjects =
    selectedProject
      ? allProjects.filter((project) => project.area_id === selectedProject.area_id)
      : [];

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

  async function loadWorkData(options?: { preserveSelection?: boolean }) {
    try {
      setIsLoadingWork(true);
      const areas = await fetchWorkAreas();
      setWorkAreas(areas);
      setWorkError(null);

      const firstProjectId = areas[0]?.projects[0]?.id ?? null;
      setExpandedProjectIds((current) => {
        if (current.length > 0) {
          return current;
        }
        return firstProjectId ? [firstProjectId] : [];
      });

      setSelectedProjectId((current) => {
        if (options?.preserveSelection && current) {
          const stillExists = areas.some((area) =>
            area.projects.some((project) => project.id === current),
          );
          if (stillExists) {
            return current;
          }
        }
        return current ?? firstProjectId;
      });
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Unable to load work data.");
    } finally {
      setIsLoadingWork(false);
    }
  }

  async function reloadCalendarEvents() {
    if (!currentRange) {
      return;
    }

    try {
      const records = await fetchCalendarEvents(currentRange.start, currentRange.end);
      setEvents(records.map(toCalendarInput));
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : "Unable to load calendar events.");
    }
  }

  function appendChatMessage(message: AgentChatMessage) {
    setWorkChat((current) => [...current, message]);
  }

  async function sendChatMessage(body: string) {
    const trimmed = body.trim();
    if (!trimmed || isSendingChat) {
      return;
    }

    appendChatMessage({
      id: `user-${Date.now()}`,
      role: "user",
      body: trimmed,
    });

    setChatInput("");

    try {
      setIsSendingChat(true);
      const response = await respondToAgent({
        message: trimmed,
        project_id: selectedProject?.id,
        now: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        range_start: currentRange?.start,
        range_end: currentRange?.end,
      });
      const nextMessage = toAgentChatMessage(response, selectedProject?.id ?? null);
      if (nextMessage.proposal) {
        setScheduleProposal(nextMessage.proposal);
      }
      appendChatMessage(nextMessage);
      await syncAgentSideEffects(response);
      setWorkError(null);
    } catch (error) {
      appendChatMessage({
        id: `agent-error-${Date.now()}`,
        role: "agent",
        meta: "Agent error",
        body: error instanceof Error ? error.message : "Unable to reach the agent.",
      });
      setWorkError(error instanceof Error ? error.message : "Unable to reach the agent.");
    } finally {
      setIsSendingChat(false);
    }
  }

  useEffect(() => {
    loadWorkData();
  }, []);

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
    if (!selectedProject) {
      return;
    }
    setScheduleProposal((current) =>
      current?.project_id === selectedProject.id ? current : null,
    );
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject || workChat.length > 0) {
      return;
    }

    void sendChatMessage("What should I focus on this week?");
  }, [selectedProject, workChat.length]);

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

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    function closeMenu() {
      setContextMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    }

    window.addEventListener("click", closeMenu);
    window.addEventListener("contextmenu", closeMenu);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("contextmenu", closeMenu);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

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

  function openProjectCreateModal() {
    const areaId = selectedProject?.area_id ?? workAreas[0]?.id;
    if (!areaId) {
      setWorkError("No area is available for a new project.");
      return;
    }

    setProjectModal({
      mode: "create",
      projectId: null,
      name: "",
      areaId,
      softDeadline: "",
    });
    setContextMenu(null);
  }

  function openProjectEditModal(project: WorkProjectRecord) {
    setProjectModal({
      mode: "edit",
      projectId: project.id,
      name: project.name,
      areaId: project.area_id,
      softDeadline: project.soft_deadline ?? "",
    });
    setContextMenu(null);
  }

  function openTaskCreateModal(projectId: string) {
    setTaskModal({
      mode: "create",
      projectId,
      taskId: null,
      name: "",
      estimateMinutes: "30",
    });
    setContextMenu(null);
  }

  function openTaskEditModal(projectId: string, task: WorkTaskRecord) {
    setTaskModal({
      mode: "edit",
      projectId,
      taskId: task.id,
      name: task.name,
      estimateMinutes: String(task.estimate_minutes),
    });
    setContextMenu(null);
  }

  function openContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    payload: Omit<ContextMenuState, "x" | "y">,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      ...payload,
      x: event.clientX,
      y: event.clientY,
    });
  }

  async function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectModal) {
      return;
    }

    try {
      if (projectModal.mode === "create") {
        const project = await createWorkProject({
          name: projectModal.name,
          area_id: projectModal.areaId,
          soft_deadline: projectModal.softDeadline || null,
        });
        setWorkNotice(`Created ${project.name}.`);
        setSelectedProjectId(project.id);
        setExpandedProjectIds((current) => [...new Set([...current, project.id])]);
      } else if (projectModal.projectId) {
        await updateWorkProject(projectModal.projectId, {
          name: projectModal.name,
          area_id: projectModal.areaId,
          soft_deadline: projectModal.softDeadline || null,
        });
        setWorkNotice("Project updated.");
      }

      setProjectModal(null);
      await loadWorkData({ preserveSelection: true });
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Unable to save project.");
    }
  }

  async function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskModal) {
      return;
    }

    const estimateMinutes = Number(taskModal.estimateMinutes);
    if (!Number.isFinite(estimateMinutes) || estimateMinutes <= 0) {
      setWorkError("Estimate must be a positive number of minutes.");
      return;
    }

    try {
      if (taskModal.mode === "create") {
        await createWorkTask(taskModal.projectId, {
          name: taskModal.name,
          estimate_minutes: estimateMinutes,
        });
        setWorkNotice("Task created.");
      } else if (taskModal.taskId) {
        await updateWorkTask(taskModal.taskId, {
          name: taskModal.name,
          estimate_minutes: estimateMinutes,
        });
        setWorkNotice("Task updated.");
      }

      setTaskModal(null);
      await loadWorkData({ preserveSelection: true });
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Unable to save task.");
    }
  }

  async function handleTaskToggle(task: WorkTaskRecord) {
    try {
      const nextStatus = task.status === "done" ? (task.linked_event_id ? "scheduled" : "todo") : "done";
      await updateWorkTask(task.id, { status: nextStatus });
      setWorkNotice(nextStatus === "done" ? "Task marked done." : "Task reopened.");
      await loadWorkData({ preserveSelection: true });
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Unable to update task.");
    }
  }

  async function handleBreakDownTask() {
    const targetTask = selectedProject?.tasks.find((task) => task.status !== "done");
    if (!targetTask) {
      setWorkError("There is no open task to break down.");
      return;
    }

    try {
      await breakDownWorkTask(targetTask.id);
      setWorkNotice(`Split ${targetTask.name} into smaller tasks.`);
      await loadWorkData({ preserveSelection: true });
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Unable to break down task.");
    }
  }

  async function handleBreakDownSpecificTask(task: WorkTaskRecord) {
    try {
      await breakDownWorkTask(task.id);
      setContextMenu(null);
      setWorkNotice(`Split ${task.name} into smaller tasks.`);
      await loadWorkData({ preserveSelection: true });
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Unable to break down task.");
    }
  }

  async function handleReviewProposal() {
    if (!selectedProject) {
      return;
    }

    try {
      const proposal = await requestScheduleProposal(selectedProject.id, false);
      setScheduleProposal(proposal);
      setWorkNotice(proposal.summary);
      setWorkError(null);
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Unable to build schedule proposal.");
    }
  }

  async function handleApplyProposal() {
    if (!selectedProject) {
      return;
    }

    try {
      const proposal = await requestScheduleProposal(selectedProject.id, true);
      setScheduleProposal(proposal);
      setWorkNotice(proposal.summary);
      await Promise.all([
        loadWorkData({ preserveSelection: true }),
        reloadCalendarEvents(),
      ]);
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Unable to apply schedule proposal.");
    }
  }

  async function handleAgentAction(action: AgentAction) {
    if (action.type === "open_project") {
      const projectId = action.payload.project_id;
      if (typeof projectId === "string") {
        setSelectedProjectId(projectId);
      }
      return;
    }

    if (action.type === "review_proposal") {
      const projectId =
        typeof action.payload.project_id === "string" ? action.payload.project_id : selectedProject?.id;
      if (!projectId || isSendingChat) {
        return;
      }

      try {
        appendChatMessage({
          id: `user-${Date.now()}`,
          role: "user",
          body: action.label,
        });
        setIsSendingChat(true);
        const response = await respondToAgent({
          message: "Commit schedule proposal",
          project_id: projectId,
          commit: true,
          now: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          range_start: currentRange?.start,
          range_end: currentRange?.end,
        });
        const nextMessage = toAgentChatMessage(response, projectId);
        if (nextMessage.proposal) {
          setScheduleProposal(nextMessage.proposal);
        }
        appendChatMessage(nextMessage);
        setWorkNotice(response.summary);
        setWorkError(null);
        await syncAgentSideEffects(response);
      } catch (error) {
        setWorkError(error instanceof Error ? error.message : "Unable to apply agent action.");
      } finally {
        setIsSendingChat(false);
      }
      return;
    }

    if (action.type === "create_event") {
      openCreateModal();
      return;
    }

    if (action.type === "ask_follow_up") {
      setChatInput("Move the plan into a realistic set of blocks for this week.");
    }
  }

  async function syncAgentSideEffects(response: AgentResponse) {
    const shouldReloadCalendar =
      response.route === "calendar" ||
      response.summary.toLowerCase().includes("created event") ||
      response.summary.toLowerCase().includes("updated event") ||
      response.summary.toLowerCase().includes("deleted event") ||
      response.summary.toLowerCase().includes("scheduled ");

    const shouldReloadWork =
      response.route === "planning" || response.route === "coaching";

    await Promise.all([
      shouldReloadCalendar ? reloadCalendarEvents() : Promise.resolve(),
      shouldReloadWork ? loadWorkData({ preserveSelection: true }) : Promise.resolve(),
    ]);
  }

  async function handleDeleteProject(project: WorkProjectRecord) {
    const confirmed = window.confirm(`Delete project "${project.name}" and all of its tasks?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteWorkProject(project.id);
      setContextMenu(null);
      setProjectModal(null);
      setWorkNotice(`Deleted ${project.name}.`);
      if (selectedProjectId === project.id) {
        setSelectedProjectId(null);
      }
      await loadWorkData({ preserveSelection: true });
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Unable to delete project.");
    }
  }

  async function handleDeleteTask(task: WorkTaskRecord) {
    const confirmed = window.confirm(`Delete task "${task.name}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteWorkTask(task.id);
      setContextMenu(null);
      setTaskModal(null);
      setWorkNotice(`Deleted ${task.name}.`);
      await loadWorkData({ preserveSelection: true });
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : "Unable to delete task.");
    }
  }

  const contextProject =
    contextMenu?.kind === "project"
      ? allProjects.find((project) => project.id === contextMenu.projectId) ?? null
      : allProjects.find((project) => project.id === contextMenu?.projectId) ?? null;
  const contextTask =
    contextMenu?.kind === "task"
      ? contextProject?.tasks.find((task) => task.id === contextMenu.id) ?? null
      : null;
  const modalProject =
    projectModal?.projectId
      ? allProjects.find((project) => project.id === projectModal.projectId) ?? null
      : null;
  const modalTask =
    taskModal?.taskId && taskModal.projectId
      ? allProjects
          .find((project) => project.id === taskModal.projectId)
          ?.tasks.find((task) => task.id === taskModal.taskId) ?? null
      : null;

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
                    {(isLoadingWork || workError || workNotice) ? (
                      <div className="status-row">
                        {isLoadingWork ? (
                          <span className="status-item status-item-loading">Loading work…</span>
                        ) : null}
                        {workError ? <span>{workError}</span> : null}
                        {!workError && workNotice ? <span>{workNotice}</span> : null}
                      </div>
                    ) : null}
                    <div className="area-list">
                      {workAreas.map((area) => (
                        <section key={area.id} className="area-section">
                          <p className="area-title">{area.name}</p>
                          <div className="project-list">
                            {area.projects.map((project) => (
                              <button
                                key={project.id}
                                type="button"
                                className="project-nav-item"
                                data-active={project.id === selectedProject?.id || undefined}
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
                                    {toProjectLabel(project.status)} · {project.last_worked_on}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                    <button
                      className="ghost-button full-width-button"
                      type="button"
                      onClick={openProjectCreateModal}
                    >
                      New project
                    </button>
                  </section>
                </div>
              </aside>

              <section className="calendar-card main-column work-main-column">
                <div className="work-project-stream">
                  <div className="work-task-list-header">
                    <p className="section-title">
                      {selectedProject ? areaNameForId(workAreas, selectedProject.area_id) : "Projects"}
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
                        data-active={project.id === selectedProject?.id || undefined}
                        onContextMenu={(event) =>
                          openContextMenu(event, {
                            kind: "project",
                            id: project.id,
                            projectId: project.id,
                          })
                        }
                      >
                        <div className="project-accordion-head">
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
                                data-tone={toneForAgentStatus(project.agent_status)}
                              >
                                {project.agent_status}
                              </span>
                            </div>

                            <div className="project-accordion-meta">
                              <span>{areaNameForId(workAreas, project.area_id)}</span>
                              <span>Last worked: {project.last_worked_on}</span>
                              <span>Deadline: {formatDeadline(project.soft_deadline) ?? "None"}</span>
                              <span>{openTasks.length} open tasks</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            className="item-menu-button"
                            aria-label={`Open menu for ${project.name}`}
                            onClick={(event) =>
                              openContextMenu(event, {
                                kind: "project",
                                id: project.id,
                                projectId: project.id,
                              })
                            }
                          >
                            ⋯
                          </button>
                        </div>

                        {isExpanded ? (
                          <div className="project-accordion-body">
                            <div className="task-list-group">
                              {openTasks.map((task) => (
                                <div
                                  key={task.id}
                                  className="task-row"
                                  onContextMenu={(event) =>
                                    openContextMenu(event, {
                                      kind: "task",
                                      id: task.id,
                                      projectId: project.id,
                                    })
                                  }
                                >
                                  <label className="task-checkbox">
                                    <input
                                      type="checkbox"
                                      checked={task.status === "done"}
                                      onChange={() => handleTaskToggle(task)}
                                    />
                                  </label>
                                  <div className="task-copy">
                                    <p className="task-name">{task.name}</p>
                                  </div>
                                  <span className="task-pill" data-state={task.status}>
                                    {task.status === "scheduled"
                                      ? `Scheduled · ${task.scheduled_label ?? "Placed"}`
                                      : task.status === "overdue"
                                        ? "Overdue"
                                        : "Unscheduled"}
                                  </span>
                                  <span className="task-duration">{task.estimate_minutes} min</span>
                                  <button
                                    type="button"
                                    className="item-menu-button"
                                    aria-label={`Open menu for ${task.name}`}
                                    onClick={(event) =>
                                      openContextMenu(event, {
                                        kind: "task",
                                        id: task.id,
                                        projectId: project.id,
                                      })
                                    }
                                  >
                                    ⋯
                                  </button>
                                </div>
                              ))}
                            </div>

                            {doneTasks.length ? (
                              <div className="task-list-complete">
                                {doneTasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className="task-row task-row-done"
                                    onContextMenu={(event) =>
                                      openContextMenu(event, {
                                        kind: "task",
                                        id: task.id,
                                        projectId: project.id,
                                      })
                                    }
                                  >
                                    <label className="task-checkbox">
                                      <input
                                        type="checkbox"
                                        checked
                                        onChange={() => handleTaskToggle(task)}
                                      />
                                    </label>
                                    <div className="task-copy">
                                      <p className="task-name">{task.name}</p>
                                    </div>
                                    <span className="task-pill" data-state="done">Done</span>
                                    <span className="task-duration">{task.estimate_minutes} min</span>
                                    <button
                                      type="button"
                                      className="item-menu-button"
                                      aria-label={`Open menu for ${task.name}`}
                                      onClick={(event) =>
                                        openContextMenu(event, {
                                          kind: "task",
                                          id: task.id,
                                          projectId: project.id,
                                        })
                                      }
                                    >
                                      ⋯
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            <button
                              className="ghost-button add-task-button"
                              type="button"
                              onClick={() => openTaskCreateModal(project.id)}
                            >
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
                      <div className="coach-bubble">
                        {selectedProject?.assessment ?? "Select a project to see planning context."}
                      </div>
                    </div>

                    <div className="agent-panel-section">
                      <p className="section-title">Suggested next moves</p>
                      <button
                        className="ghost-button full-width-button"
                        type="button"
                        onClick={handleReviewProposal}
                        disabled={!selectedProject}
                      >
                        Review schedule proposal
                      </button>
                      <button
                        className="ghost-button full-width-button"
                        type="button"
                        onClick={handleBreakDownTask}
                        disabled={!selectedProject}
                      >
                        Break into smaller tasks
                      </button>
                      {scheduleProposal && selectedProject && scheduleProposal.project_id === selectedProject.id ? (
                        <div className="context-list">
                          <div className="context-item">
                            <strong>{scheduleProposal.summary}</strong>
                          </div>
                          <ScheduleProposalPreview proposal={scheduleProposal} />
                          {scheduleProposal.committed ? null : (
                            <button
                              className="primary-button full-width-button"
                              type="button"
                              onClick={handleApplyProposal}
                            >
                              Apply proposal
                            </button>
                          )}
                        </div>
                      ) : null}
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
                    {workAreas.map((area) => (
                      <section key={area.id} className="area-section">
                        <p className="area-title">{area.name}</p>
                        <div className="project-list">
                          {area.projects.map((project) => (
                            <div
                              key={project.id}
                              className="jarvis-tree-project"
                              data-active={project.id === selectedProject?.id || undefined}
                            >
                              <div className="jarvis-project-header">
                                <button
                                  type="button"
                                  className="project-nav-item jarvis-project-button"
                                  data-active={project.id === selectedProject?.id || undefined}
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
                                      {project.agent_status} · {project.last_worked_on}
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
                          {message.proposal ? (
                            <ScheduleProposalPreview proposal={message.proposal} />
                          ) : null}
                          {message.insights?.length ? (
                            <div className="agent-insight-grid">
                              {message.insights.map((insight) => (
                                <article key={`${message.id}-${insight.title}`} className="agent-insight-card">
                                  <p className="agent-insight-title">{insight.title}</p>
                                  <p className="agent-insight-body">{insight.body}</p>
                                </article>
                              ))}
                            </div>
                          ) : null}
                          {message.actions?.length ? (
                            <div className="agent-action-row">
                              {message.actions.map((action) => (
                                <button
                                  key={`${message.id}-${action.label}`}
                                  className="ghost-button chat-prompt-chip"
                                  type="button"
                                  onClick={() => void handleAgentAction(action)}
                                  disabled={isSendingChat}
                                >
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ),
                    )}
                    {isSendingChat ? (
                      <article className="chat-message" data-role="agent">
                        <div className="chat-message-head">
                          <span />
                          <span className="chat-message-meta">Thinking</span>
                        </div>
                        <div className="chat-loader" aria-label="Working through the request" role="status">
                          <span className="chat-loader-dot" />
                          <span className="chat-loader-dot" />
                          <span className="chat-loader-dot" />
                        </div>
                      </article>
                    ) : null}
                  </div>

                  <div className="chat-quick-prompts jarvis-prompts">
                    {WORK_CHAT_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        className="ghost-button chat-prompt-chip"
                        type="button"
                        onClick={() => void sendChatMessage(prompt)}
                        disabled={isSendingChat}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  <form
                    className="jarvis-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendChatMessage(chatInput);
                    }}
                  >
                    <textarea
                      className="field-input jarvis-input"
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendChatMessage(chatInput);
                        }
                      }}
                      placeholder="Ask the agent to plan, prioritize, or review your calendar."
                      rows={1}
                      disabled={isSendingChat}
                    />
                    <button className="primary-button jarvis-send-button" type="submit" disabled={isSendingChat}>
                      {isSendingChat ? "Thinking..." : "Send"}
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

      {contextMenu ? (
        <div
          className="context-menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === "project" && contextProject ? (
            <>
              <button
                className="context-menu-item"
                type="button"
                onClick={() => openProjectEditModal(contextProject)}
              >
                Edit project
              </button>
              <button
                className="context-menu-item"
                type="button"
                onClick={() => openTaskCreateModal(contextProject.id)}
              >
                Add task
              </button>
              <button
                className="context-menu-item context-menu-item-danger"
                type="button"
                onClick={() => handleDeleteProject(contextProject)}
              >
                Delete project
              </button>
            </>
          ) : null}

          {contextMenu.kind === "task" && contextProject && contextTask ? (
            <>
              <button
                className="context-menu-item"
                type="button"
                onClick={() => openTaskEditModal(contextProject.id, contextTask)}
              >
                Edit task
              </button>
              <button
                className="context-menu-item"
                type="button"
                onClick={() => handleTaskToggle(contextTask)}
              >
                {contextTask.status === "done" ? "Mark as open" : "Mark as done"}
              </button>
              <button
                className="context-menu-item"
                type="button"
                onClick={() => handleBreakDownSpecificTask(contextTask)}
              >
                Break into smaller tasks
              </button>
              <button
                className="context-menu-item context-menu-item-danger"
                type="button"
                onClick={() => handleDeleteTask(contextTask)}
              >
                Delete task
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {projectModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setProjectModal(null)}>
          <div
            className="modal-panel modal-panel-quick"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Work</p>
                <h2 id="project-modal-title" className="modal-title">
                  {projectModal.mode === "create" ? "New project" : "Edit project"}
                </h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => setProjectModal(null)}>
                Close
              </button>
            </div>

            <form className="event-form" onSubmit={handleProjectSubmit}>
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="field-input"
                  value={projectModal.name}
                  onChange={(event) =>
                    setProjectModal((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  placeholder="Interview Prep"
                  required
                />
              </label>

              <label className="field">
                <span className="field-label">Area</span>
                <select
                  className="field-input"
                  value={projectModal.areaId}
                  onChange={(event) =>
                    setProjectModal((current) =>
                      current ? { ...current, areaId: event.target.value } : current,
                    )
                  }
                >
                  {workAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label">Soft deadline</span>
                <input
                  className="field-input"
                  type="date"
                  value={projectModal.softDeadline}
                  onChange={(event) =>
                    setProjectModal((current) =>
                      current ? { ...current, softDeadline: event.target.value } : current,
                    )
                  }
                />
              </label>

              <div className="modal-actions">
                {projectModal.mode === "edit" && modalProject ? (
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => handleDeleteProject(modalProject)}
                  >
                    Delete
                  </button>
                ) : null}
                <button className="ghost-button" type="button" onClick={() => setProjectModal(null)}>
                  Cancel
                </button>
                <button className="primary-button" type="submit">
                  {projectModal.mode === "create" ? "Create project" : "Save project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {taskModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setTaskModal(null)}>
          <div
            className="modal-panel modal-panel-quick"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Work</p>
                <h2 id="task-modal-title" className="modal-title">
                  {taskModal.mode === "create" ? "New task" : "Edit task"}
                </h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => setTaskModal(null)}>
                Close
              </button>
            </div>

            <form className="event-form" onSubmit={handleTaskSubmit}>
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="field-input"
                  value={taskModal.name}
                  onChange={(event) =>
                    setTaskModal((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  placeholder="Run mock interview"
                  required
                />
              </label>

              <label className="field">
                <span className="field-label">Estimate (minutes)</span>
                <input
                  className="field-input"
                  type="number"
                  min="15"
                  step="5"
                  value={taskModal.estimateMinutes}
                  onChange={(event) =>
                    setTaskModal((current) =>
                      current ? { ...current, estimateMinutes: event.target.value } : current,
                    )
                  }
                  required
                />
              </label>

              <div className="modal-actions">
                {taskModal.mode === "edit" && modalTask ? (
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => handleDeleteTask(modalTask)}
                  >
                    Delete
                  </button>
                ) : null}
                <button className="ghost-button" type="button" onClick={() => setTaskModal(null)}>
                  Cancel
                </button>
                <button className="primary-button" type="submit">
                  {taskModal.mode === "create" ? "Create task" : "Save task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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

function areaNameForId(areas: WorkAreaRecord[], areaId: string): string {
  return areas.find((area) => area.id === areaId)?.name ?? "Unknown";
}

function toProjectLabel(status: WorkProjectRecord["status"]): string {
  if (status === "active") {
    return "Active";
  }

  if (status === "parked") {
    return "Parked";
  }

  return "Done";
}

function toneForAgentStatus(status: WorkProjectRecord["agent_status"]): AgentCardTone {
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

function toAgentChatMessage(
  response: AgentResponse,
  fallbackProjectId: string | null,
): AgentChatMessage {
  return {
    id: `agent-${Date.now()}`,
    role: "agent",
    meta: `${response.route} agent`,
    body: response.summary,
    insights: response.insights,
    actions: response.actions,
    proposal: toScheduleProposal(response, fallbackProjectId),
  };
}

function ScheduleProposalPreview({ proposal }: { proposal: ScheduleProposal }) {
  return (
    <div className="schedule-proposal-card" data-committed={proposal.committed || undefined}>
      <div className="schedule-proposal-header">
        <span className="schedule-proposal-label">
          {proposal.committed ? "Scheduled blocks" : "Proposed schedule"}
        </span>
        <span className="schedule-proposal-meta">
          {proposal.blocks.length} block{proposal.blocks.length === 1 ? "" : "s"}
        </span>
      </div>
      {proposal.blocks.length ? (
        <div className="schedule-proposal-list">
          {proposal.blocks.map((block) => (
            <div key={`${block.task_id}-${block.start}`} className="schedule-proposal-item">
              <p className="schedule-proposal-task">{block.task_name}</p>
              <p className="schedule-proposal-time">
                {formatProposalWindow(block.start, block.end)} · {formatProposalDuration(block.start, block.end)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="schedule-proposal-empty">No blocks proposed.</p>
      )}
    </div>
  );
}

function toScheduleProposal(
  response: AgentResponse,
  fallbackProjectId: string | null,
): ScheduleProposal | null {
  if (response.route !== "planning") {
    return null;
  }

  const projectId =
    typeof response.data.project_id === "string" ? response.data.project_id : fallbackProjectId;
  const blocks = Array.isArray(response.data.blocks) ? response.data.blocks : [];
  if (!projectId) {
    return null;
  }

  return {
    project_id: projectId,
    committed: response.actions.length === 0 && response.summary.toLowerCase().includes("scheduled"),
    summary: response.summary,
    blocks: blocks.flatMap((block) => {
      const candidate = typeof block === "object" && block !== null ? (block as Record<string, unknown>) : null;
      if (
        !candidate ||
        typeof candidate.task_id !== "string" ||
        typeof candidate.task_name !== "string" ||
        typeof candidate.start !== "string" ||
        typeof candidate.end !== "string"
      ) {
        return [];
      }

      return [
        {
          task_id: candidate.task_id,
          task_name: candidate.task_name,
          start: candidate.start,
          end: candidate.end,
          title: candidate.task_name,
        },
      ];
    }),
  };
}

function formatProposalWindow(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })} - ${endDate.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatProposalDuration(start: string, end: string): string {
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  return `${minutes} min`;
}

function formatDeadline(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
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
