import { useState } from 'react';
import { useAppStore, generateId } from './store';
import { computePhaseBlocks } from './conflicts';
import { TimelineGrid } from './components/TimelineGrid';
import { LeftPanel } from './components/LeftPanel';
import { TeamManager } from './components/TeamManager';
import { SprintSettings } from './components/SprintSettings';
import { TaskEditor } from './components/TaskEditor';
import type { Task } from './types';
import './index.css';

type Modal = 'team' | 'sprint' | 'newtask' | null;

const VIEW_OPTIONS = [
  { key: '1w', label: '1 неделя', days: 7 },
  { key: '2w', label: '2 недели', days: 14 },
  { key: '3w', label: '3 недели', days: 21 },
  { key: '1m', label: 'Месяц', days: 30 },
] as const;

type ViewKey = typeof VIEW_OPTIONS[number]['key'];

export default function App() {
  const store = useAppStore();
  const { state } = store;
  const [modal, setModal] = useState<Modal>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [view, setView] = useState<ViewKey>('2w');

  const sprintDays = VIEW_OPTIONS.find(v => v.key === view)?.days ?? state.sprint.totalDays;
  const blocks = computePhaseBlocks(state.tasks, state.sprint.startDate);

  const conflictTasks = new Set(blocks.filter(b => b.hasConflict).map(b => b.taskId));

  // Navigate sprint weeks
  function shiftSprint(weeks: number) {
    const d = new Date(state.sprint.startDate);
    d.setDate(d.getDate() + weeks * 7);
    store.updateSprint({ ...state.sprint, startDate: d.toISOString().slice(0, 10) });
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
      {/* ── Top header ── */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm z-20">
        <div className="flex items-center gap-3 px-4 h-12">
          {/* Logo + title */}
          <div className="flex items-center gap-2 mr-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="font-bold text-slate-800 text-sm">Sprint Planner</span>
          </div>

          <div className="w-px h-6 bg-slate-200" />

          {/* Sprint name + settings */}
          <button
            onClick={() => setModal('sprint')}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-cyan-600 transition-colors"
          >
            {state.sprint.name}
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Sprint navigation */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => shiftSprint(-1)}
              className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-white hover:text-slate-800 transition-colors text-xs font-bold"
            >‹</button>
            <span className="text-xs text-slate-600 px-1 font-medium min-w-[72px] text-center">
              {new Date(state.sprint.startDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
            </span>
            <button
              onClick={() => shiftSprint(1)}
              className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-white hover:text-slate-800 transition-colors text-xs font-bold"
            >›</button>
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
            {VIEW_OPTIONS.map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  view === v.key
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Conflict badge */}
          {conflictTasks.size > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-full">
              <span>⚠</span>
              <span>{conflictTasks.size} {conflictTasks.size === 1 ? 'конфликт' : 'конфликта'}</span>
            </div>
          )}

          {/* Team button */}
          <button
            onClick={() => setModal('team')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-slate-700 rounded-lg hover:border-cyan-400 hover:text-cyan-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Команда
          </button>

          {/* New task */}
          <button
            onClick={() => setModal('newtask')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Задача
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <LeftPanel
          tasks={state.tasks}
          people={state.people}
          blocks={blocks}
          onEditTask={setEditingTask}
          onDeleteTask={store.deleteTask}
          onNewTask={() => setModal('newtask')}
        />

        {/* Timeline */}
        <div className="flex-1 overflow-hidden bg-white">
          <TimelineGrid
            teams={state.teams}
            people={state.people}
            tasks={state.tasks}
            blocks={blocks}
            sprintDays={sprintDays}
            startDate={state.sprint.startDate}

            onUpdateTask={store.updateTask}
            onDeleteTask={store.deleteTask}
            onToggleTeam={store.toggleTeam}
          />
        </div>
      </div>

      {/* ── Modals ── */}
      {modal === 'team' && (
        <TeamManager
          teams={state.teams}
          people={state.people}
          onAddTeam={store.addTeam}
          onUpdateTeam={store.updateTeam}
          onDeleteTeam={store.deleteTeam}
          onAddPerson={store.addPerson}
          onUpdatePerson={store.updatePerson}
          onDeletePerson={store.deletePerson}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'sprint' && (
        <SprintSettings
          sprint={state.sprint}
          onSave={store.updateSprint}
          onClose={() => setModal(null)}
        />
      )}

      {(modal === 'newtask' || editingTask) && (
        <TaskEditor
          task={editingTask}
          people={state.people}
          sprintDays={sprintDays}
          startDate={state.sprint.startDate}
          onSave={task => {
            store.updateTask(editingTask ? task : { ...task, id: generateId() });
          }}
          onDelete={store.deleteTask}
          onClose={() => { setModal(null); setEditingTask(null); }}
        />
      )}
    </div>
  );
}
