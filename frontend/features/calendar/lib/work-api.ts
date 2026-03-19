const API_BASE_URL =
  process.env.NEXT_PUBLIC_PLANNING_API_URL ?? "http://127.0.0.1:8000/api";

export type WorkTaskRecord = {
  id: string;
  name: string;
  estimate_minutes: number;
  status: "todo" | "scheduled" | "overdue" | "done";
  scheduled_label: string | null;
  linked_event_id: string | null;
};

export type WorkProjectRecord = {
  id: string;
  name: string;
  area_id: string;
  priority: "high" | "medium" | "low";
  status: "active" | "parked" | "done";
  soft_deadline: string | null;
  last_worked_on: string;
  agent_status: "Active" | "Neglected" | "On track" | "Parked";
  assessment: string;
  tasks: WorkTaskRecord[];
};

export type WorkAreaRecord = {
  id: string;
  name: string;
  projects: WorkProjectRecord[];
};

export type ScheduleProposalBlock = {
  task_id: string;
  task_name: string;
  start: string;
  end: string;
  title: string;
};

export type ScheduleProposal = {
  project_id: string;
  committed: boolean;
  summary: string;
  blocks: ScheduleProposalBlock[];
};

export type AgentRoute = "calendar" | "planning" | "coaching";

export type AgentAction = {
  type: "open_project" | "review_proposal" | "create_event" | "ask_follow_up";
  label: string;
  payload: Record<string, string | boolean | number | null>;
};

export type AgentInsight = {
  title: string;
  body: string;
};

export type AgentResponse = {
  route: AgentRoute;
  summary: string;
  rationale: string;
  insights: AgentInsight[];
  actions: AgentAction[];
  data: Record<string, unknown>;
};

async function parseResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  let message = fallbackMessage;
  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) {
      message = payload.detail;
    }
  } catch {}

  throw new Error(message);
}

export async function fetchWorkAreas(): Promise<WorkAreaRecord[]> {
  const response = await fetch(`${API_BASE_URL}/work/areas`, { cache: "no-store" });
  return parseResponse(response, "Unable to load work data.");
}

export async function createWorkProject(payload: {
  name: string;
  area_id?: string;
  soft_deadline?: string | null;
}): Promise<WorkProjectRecord> {
  const response = await fetch(`${API_BASE_URL}/work/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse(response, "Unable to create project.");
}

export async function updateWorkProject(
  projectId: string,
  payload: {
    name?: string;
    area_id?: string;
    soft_deadline?: string | null;
    priority?: string;
    status?: string;
  },
): Promise<WorkProjectRecord> {
  const response = await fetch(`${API_BASE_URL}/work/projects/${projectId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse(response, "Unable to update project.");
}

export async function deleteWorkProject(projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/work/projects/${projectId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Unable to delete project.");
  }
}

export async function createWorkTask(
  projectId: string,
  payload: { name: string; estimate_minutes: number },
): Promise<WorkProjectRecord> {
  const response = await fetch(`${API_BASE_URL}/work/projects/${projectId}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse(response, "Unable to create task.");
}

export async function updateWorkTask(
  taskId: string,
  payload: { status?: string; name?: string; estimate_minutes?: number },
): Promise<WorkProjectRecord> {
  const response = await fetch(`${API_BASE_URL}/work/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse(response, "Unable to update task.");
}

export async function deleteWorkTask(taskId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/work/tasks/${taskId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Unable to delete task.");
  }
}

export async function breakDownWorkTask(taskId: string): Promise<WorkProjectRecord> {
  const response = await fetch(`${API_BASE_URL}/work/tasks/${taskId}/breakdown`, {
    method: "POST",
  });
  return parseResponse(response, "Unable to break down task.");
}

export async function requestScheduleProposal(
  projectId: string,
  commit = false,
): Promise<ScheduleProposal> {
  const response = await fetch(`${API_BASE_URL}/work/projects/${projectId}/proposal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ commit }),
  });
  return parseResponse(response, "Unable to build schedule proposal.");
}

export async function respondToAgent(payload: {
  message: string;
  project_id?: string;
  commit?: boolean;
  now?: string;
  timezone?: string;
  range_start?: string;
  range_end?: string;
}): Promise<AgentResponse> {
  const response = await fetch(`${API_BASE_URL}/agent/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse(response, "Unable to reach the agent.");
}
