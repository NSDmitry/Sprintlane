export interface Person {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface Phase {
  id: string;
  label: string;
  assigneeId: string;
  durationDays: number;
  startAfterDays?: number; // optional offset from task start; if omitted, phase starts after previous one
  color?: string; // optional override
}

export interface Task {
  id: string;
  name: string;
  sprintGoal: boolean;
  startDay: number; // 0-based calendar day index from sprint start
  sprintStartDate: string; // ISO date of the sprint this task belongs to
  phases: Phase[];
  color?: string; // task color override
}

export interface Sprint {
  name: string;
  totalDays: number;
  startDate: string; // ISO "2026-04-14"
}

export interface AppState {
  sprint: Sprint;
  people: Person[];
  tasks: Task[];
}

export interface PhaseBlock {
  taskId: string;
  taskName: string;
  taskColor: string;
  taskIsSprintGoal: boolean;
  phaseId: string;
  phaseLabel: string;
  assigneeId: string;      // person whose row this appears on
  startDay: number;
  endDay: number;          // exclusive
  hasConflict: boolean;
  isExternal: boolean;     // true = no real assignee (e.g. review), shown on prev person's row, no conflict
}

// Per-person, per-day load summary
export type DayLoad = 0 | 1 | 2; // 0=free, 1=one task, 2=overloaded
