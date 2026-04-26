import { useState } from 'react';
import type { Task, Person, PhaseBlock } from '../types';
import { formatDuration } from '../conflicts';

interface Props {
  tasks: Task[];
  people: Person[];
  blocks: PhaseBlock[];
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onNewTask: () => void;
}

export function LeftPanel({ tasks, people, blocks, onEditTask, onDeleteTask, onNewTask }: Props) {
  const [search, setSearch] = useState('');

  const getPerson = (id: string) => people.find(p => p.id === id);

  const taskHasConflict = (taskId: string) =>
    blocks.some(b => b.taskId === taskId && b.hasConflict);

  const filtered = tasks.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );
  const conflictTasks = filtered.filter(task => taskHasConflict(task.id));
  const sprintGoalTasks = filtered.filter(task => task.sprintGoal && !taskHasConflict(task.id));
  const unplannedTasks = filtered.filter(task => !task.sprintGoal && !taskHasConflict(task.id) && blocks.every(b => b.taskId !== task.id));
  const otherTasks = filtered.filter(task => !task.sprintGoal && !taskHasConflict(task.id) && blocks.some(b => b.taskId === task.id));

  const renderTaskCard = (task: Task) => {
    const conflict = taskHasConflict(task.id);
    const taskBlocks = blocks.filter(b => b.taskId === task.id);
    const taskColor = taskBlocks[0]?.taskColor ?? '#3b82f6';
    const duration = task.phases.reduce((sum, phase) => sum + phase.durationDays, 0);

    return (
      <div
        key={task.id}
        className={`mx-2 mb-1 rounded-lg border bg-white transition-all cursor-pointer group ${
          conflict ? 'border-red-200 hover:border-red-300 hover:shadow-sm' : 'border-slate-200 hover:border-cyan-300 hover:shadow-sm'
        }`}
        onClick={() => onEditTask(task)}
      >
        <div className="flex items-start gap-2 px-3 py-2">
          <div
            className="w-1 rounded-full flex-shrink-0 mt-0.5"
            style={{ background: taskColor, height: conflict ? 'auto' : 'auto', minHeight: 16 }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              {conflict && <span className="text-red-500 text-xs flex-shrink-0">⚠</span>}
              <span className="text-xs font-semibold text-slate-800 truncate leading-snug">
                {task.name}
              </span>
              {task.sprintGoal && <span className="text-xs flex-shrink-0" title="Цель спринта">🔥</span>}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
              <span>{task.phases.length} фаз</span>
              <span>·</span>
              <span>{formatDuration(duration)}</span>
              {taskBlocks.length === 0 && (
                <>
                  <span>·</span>
                  <span className="font-medium text-slate-500">не на сетке</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
              {task.phases.map(phase => {
                const person = getPerson(phase.assigneeId);
                return (
                  <span
                    key={phase.id}
                    className="inline-flex items-center gap-1 text-[10px] text-slate-500 min-w-0"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: person?.color ?? '#94a3b8' }}
                    />
                    {phase.label}
                    {person ? ` · ${person.name}` : ''}
                  </span>
                );
              })}
            </div>
          </div>
          <button
            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all text-sm leading-none flex-shrink-0"
            onClick={e => { e.stopPropagation(); onDeleteTask(task.id); }}
            title="Удалить"
          >
            ×
          </button>
        </div>
      </div>
    );
  };

  const renderSection = (title: string, items: Task[]) => {
    if (items.length === 0) return null;

    return (
      <div className="mb-3">
        <div className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          {title}
        </div>
        <div>{items.map(renderTaskCard)}</div>
      </div>
    );
  };

  return (
    <div className="w-64 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Задачи</span>
          <button
            onClick={onNewTask}
            className="w-6 h-6 rounded bg-cyan-500 text-white flex items-center justify-center hover:bg-cyan-600 transition-colors text-sm font-bold"
            title="Добавить задачу"
          >
            +
          </button>
        </div>
        <input
          className="w-full bg-slate-100 rounded-lg px-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          placeholder="Поиск задач..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto py-2">
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-slate-400 text-xs">
            {tasks.length === 0 ? 'Нет задач. Нажмите + чтобы добавить.' : 'Ничего не найдено'}
          </div>
        )}
        {renderSection('С Конфликтами', conflictTasks)}
        {renderSection('Цели Спринта', sprintGoalTasks)}
        {renderSection('Запланированы', otherTasks)}
        {renderSection('Не На Сетке', unplannedTasks)}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-2 border-t border-slate-200 text-[10px] text-slate-400">
        {tasks.length} задач · {tasks.reduce((s, t) => s + t.phases.length, 0)} фаз
      </div>
    </div>
  );
}
