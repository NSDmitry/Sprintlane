import { useState, useCallback } from 'react';
import type { AppState, Person, Task, Phase, Sprint, SprintEvent } from './types';

const STORAGE_KEY = 'sprint-planner-v2';

const PERSON_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function nearestMondayISO(): string {
  const date = new Date();
  const dow = date.getDay();
  const diff = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

const defaultState: AppState = {
  sprint: { name: 'Sprint 1', totalDays: 14, startDate: nearestMondayISO() },
  people: [],
  tasks: [],
  events: [],
};

function saveState(state: AppState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState & { teams?: unknown };
      let didMigrate = false;
      if (!parsed.sprint.startDate) { parsed.sprint.startDate = nearestMondayISO(); didMigrate = true; }
      // drop legacy teams field
      if (parsed.teams !== undefined) { delete parsed.teams; didMigrate = true; }
      // strip legacy teamId from people
      parsed.people = (parsed.people ?? []).map(p => {
        const { teamId: _teamId, ...rest } = p as Person & { teamId?: string };
        return rest as Person;
      });
      parsed.tasks = (parsed.tasks ?? []).map(task => {
        let t = task;
        if (typeof t.sprintGoal !== 'boolean') { t = { ...t, sprintGoal: false }; didMigrate = true; }
        if (!t.sprintStartDate) { t = { ...t, sprintStartDate: '2026-04-13' }; didMigrate = true; }
        return t;
      });
      if (!parsed.events) { parsed.events = []; didMigrate = true; }
      if (didMigrate) saveState(parsed);
      return parsed;
    }
  } catch {}
  return defaultState;
}

export function useAppStore() {
  const [state, setState] = useState<AppState>(loadState);

  const update = useCallback((updater: (s: AppState) => AppState) => {
    setState(prev => {
      const next = updater(prev);
      saveState(next);
      return next;
    });
  }, []);

  // Sprint
  const updateSprint = useCallback((sprint: Sprint) => {
    update(s => ({ ...s, sprint }));
  }, [update]);

  // People
  const addPerson = useCallback((name: string, role: string) => {
    setState(prev => {
      const usedColors = new Set(prev.people.map(p => p.color));
      const color = PERSON_COLORS.find(c => !usedColors.has(c)) ?? PERSON_COLORS[prev.people.length % PERSON_COLORS.length];
      const person: Person = { id: generateId(), name, role, color };
      const next = { ...prev, people: [...prev.people, person] };
      saveState(next);
      return next;
    });
  }, []);

  const updatePerson = useCallback((person: Person) => {
    update(s => ({ ...s, people: s.people.map(p => p.id === person.id ? person : p) }));
  }, [update]);

  const deletePerson = useCallback((id: string) => {
    update(s => ({
      ...s,
      people: s.people.filter(p => p.id !== id),
      tasks: s.tasks.map(t => ({
        ...t,
        phases: t.phases.map(ph => ph.assigneeId === id ? { ...ph, assigneeId: '' } : ph),
      })),
    }));
  }, [update]);

  // Tasks
  const updateTask = useCallback((task: Task) => {
    update(s => {
      const exists = s.tasks.some(t => t.id === task.id);
      return {
        ...s,
        tasks: exists ? s.tasks.map(t => t.id === task.id ? task : t) : [...s.tasks, task],
      };
    });
  }, [update]);

  const deleteTask = useCallback((id: string) => {
    update(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id) }));
  }, [update]);

  // Phases
  const updatePhase = useCallback((taskId: string, phase: Phase) => {
    update(s => ({
      ...s,
      tasks: s.tasks.map(t =>
        t.id === taskId
          ? { ...t, phases: t.phases.map(ph => ph.id === phase.id ? phase : ph) }
          : t
      ),
    }));
  }, [update]);

  // Events
  const upsertEvent = useCallback((event: SprintEvent) => {
    update(s => {
      const exists = s.events.some(e => e.id === event.id);
      return {
        ...s,
        events: exists
          ? s.events.map(e => e.id === event.id ? event : e)
          : [...s.events, event],
      };
    });
  }, [update]);

  const deleteEvent = useCallback((id: string) => {
    update(s => ({ ...s, events: s.events.filter(e => e.id !== id) }));
  }, [update]);

  return {
    state,
    updateSprint,
    addPerson, updatePerson, deletePerson,
    updateTask, deleteTask, updatePhase,
    upsertEvent, deleteEvent,
  };
}
