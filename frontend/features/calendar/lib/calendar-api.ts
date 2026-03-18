export type CalendarEventRecord = {
  id: string;
  title: string;
  start: string;
  end: string;
  notes: string | null;
  all_day: boolean;
  duration_minutes: number;
};

export type CalendarEventPayload = {
  title: string;
  start: string;
  end: string;
  notes?: string | null;
  all_day?: boolean;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PLANNING_API_URL ?? "http://127.0.0.1:8000/api";

export async function fetchCalendarEvents(start: string, end: string): Promise<CalendarEventRecord[]> {
  const url = new URL(`${API_BASE_URL}/calendar/events`);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load calendar events.");
  }

  return response.json();
}

export async function createCalendarEvent(
  payload: CalendarEventPayload,
): Promise<CalendarEventRecord> {
  const response = await fetch(`${API_BASE_URL}/calendar/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Unable to create calendar event.");
  }

  return response.json();
}

export async function updateCalendarEvent(
  eventId: string,
  payload: Partial<CalendarEventPayload>,
): Promise<CalendarEventRecord> {
  const response = await fetch(`${API_BASE_URL}/calendar/events/${eventId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Unable to update calendar event.");
  }

  return response.json();
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/calendar/events/${eventId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Unable to delete calendar event.");
  }
}
