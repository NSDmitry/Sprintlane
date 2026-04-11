import { useState, useCallback } from 'react';
import type { AppState, Person, Task, Phase, Sprint, Team } from './types';

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

const DEFAULT_TEAM_ID = 'team-default';

const defaultState: AppState = {
  sprint: { name: 'Sprint 1', totalDays: 14, startDate: nearestMondayISO() },
  teams: [{ id: DEFAULT_TEAM_ID, name: 'Команда', collapsed: false }],
  people: [],
  tasks: [],
};

function saveState(state: AppState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      let didMigrate = false;
      if (!parsed.sprint.startDate) parsed.sprint.startDate = nearestMondayISO();
      if (!parsed.teams) parsed.teams = defaultState.teams;
      // migrate people without teamId
      parsed.people = parsed.people.map(p => {
        if (p.teamId) return p;
        didMigrate = true;
        return { ...p, teamId: DEFAULT_TEAM_ID };
      });
      parsed.tasks = (parsed.tasks ?? []).map(task => {
        if (typeof task.sprintGoal === 'boolean') return task;
        didMigrate = true;
        return { ...task, sprintGoal: false };
      });
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

  // Teams
  const addTeam = useCallback((name: string) => {
    const team: Team = { id: generateId(), name, collapsed: false };
    update(s => ({ ...s, teams: [...s.teams, team] }));
  }, [update]);

  const updateTeam = useCallback((team: Team) => {
    update(s => ({ ...s, teams: s.teams.map(t => t.id === team.id ? team : t) }));
  }, [update]);

  const deleteTeam = useCallback((id: string) => {
    update(s => ({
      ...s,
      teams: s.teams.filter(t => t.id !== id),
      people: s.people.map(p => p.teamId === id ? { ...p, teamId: DEFAULT_TEAM_ID } : p),
    }));
  }, [update]);

  const toggleTeam = useCallback((id: string) => {
    update(s => ({
      ...s,
      teams: s.teams.map(t => t.id === id ? { ...t, collapsed: !t.collapsed } : t),
    }));
  }, [update]);

  // People
  const addPerson = useCallback((name: string, role: string, teamId: string) => {
    setState(prev => {
      const usedColors = new Set(prev.people.map(p => p.color));
      const color = PERSON_COLORS.find(c => !usedColors.has(c)) ?? PERSON_COLORS[prev.people.length % PERSON_COLORS.length];
      const person: Person = { id: generateId(), name, role, color, teamId };
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

  return {
    state,
    updateSprint,
    addTeam, updateTeam, deleteTeam, toggleTeam,
    addPerson, updatePerson, deletePerson,
    updateTask, deleteTask, updatePhase,
  };
}
