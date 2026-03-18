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

export function CalendarShell() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date("2026-03-18T09:00:00"));
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("quick");
  const [eventDraft, setEventDraft] = useState<EventDraft>(emptyDraft("2026-03-18"));
  const [events, setEvents] = useState<EventInput[]>([]);
  const [currentRange, setCurrentRange] = useState<{ start: string; end: string } | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

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
      <main className="app-shell">
        <div className="workspace">
          <div className="topbar-shell">
            <div className="topbar">
              <div className="brand">Productivity Agent</div>
              <nav className="nav-group" aria-label="Primary navigation">
                <button className="nav-item" data-active="false" type="button">Work</button>
                <button className="nav-item" data-active="true" type="button">Calendar</button>
              </nav>
            </div>
          </div>

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
