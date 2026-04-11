import { useState, useEffect, useRef } from 'react';
import type { Person, Team, Task, PhaseBlock, DayLoad } from '../types';
import { computePersonLoad, formatDuration } from '../conflicts';
import { TaskEditor } from './TaskEditor';

interface Props {
  teams: Team[];
  people: Person[];
  tasks: Task[];
  blocks: PhaseBlock[];
  sprintDays: number;
  startDate: string;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onToggleTeam: (id: string) => void;
}

const LABEL_WIDTH = 200;
const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 52;
const MIN_DAY_WIDTH = 24; // px — minimum before horizontal scroll kicks in

const DAY_NAMES = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function getDayMeta(startDate: string, i: number) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + i);
  const dow = d.getDay();
  return {
    day: d.getDate(),
    month: d.getMonth() + 1,
    dayName: DAY_NAMES[dow],
    isWeekend: dow === 0 || dow === 6,
    isToday: d.toDateString() === new Date().toDateString(),
  };
}

function isWeekend(startDate: string, i: number) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + i);
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

const LOAD_BG: Record<DayLoad, string> = {
  0: '#e2e8f0',
  1: '#22c55e',
  2: '#ef4444',
};

interface Tooltip {
  x: number; y: number;
  block: PhaseBlock;
  personName: string;
}

interface DragState {
  taskId: string;
  originalStartDay: number;
  mouseStartX: number;
  deltaDays: number;
}

export function TimelineGrid({
  teams, people, tasks, blocks, sprintDays, startDate,
  onUpdateTask, onDeleteTask, onToggleTeam,
}: Props) {
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // Use ref so mousemove handler always has fresh values without stale closure
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  // Measure container width to compute dayWidth automatically
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(width);
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const dayWidth = Math.max(MIN_DAY_WIDTH, (containerWidth - LABEL_WIDTH) / sprintDays);

  // Global mouse handlers for drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaX = e.clientX - d.mouseStartX;
      const rawDelta = Math.round(deltaX / dayWidth);
      const newStart = Math.max(0, d.originalStartDay + rawDelta);
      const deltaDays = newStart - d.originalStartDay;
      if (deltaDays !== d.deltaDays) {
        setDrag(prev => prev ? { ...prev, deltaDays } : null);
      }
    };

    const onMouseUp = () => {
      const d = dragRef.current;
      if (!d) return;
      const task = tasks.find(t => t.id === d.taskId);
      if (task) {
        const newStartDay = Math.max(0, d.originalStartDay + d.deltaDays);
        if (newStartDay !== task.startDay) {
          onUpdateTask({ ...task, startDay: newStartDay });
        }
      }
      setDrag(null);
    };

    if (drag) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [drag, dayWidth, tasks, onUpdateTask]);

  const totalWidth = LABEL_WIDTH + sprintDays * dayWidth;

  const getTask = (id: string) => tasks.find(t => t.id === id);
  const getPerson = (id: string) => people.find(p => p.id === id);

  const teamRows = teams.map(team => ({
    team,
    members: people.filter(p => p.teamId === team.id),
  }));
  const orphans = people.filter(p => !teams.find(t => t.id === p.teamId));

  const renderPersonRow = (person: Person) => {
    const personBlocks = blocks.filter(b => b.assigneeId === person.id);
    const loads: DayLoad[] = computePersonLoad(person.id, blocks, sprintDays);
    const overloaded = loads.some(l => l === 2);
    const conflictCount = personBlocks.filter(b => b.hasConflict).length;

    return (
      <div
        key={person.id}
        className={`flex border-b border-slate-100 ${overloaded ? 'bg-red-50/30' : 'bg-white hover:bg-slate-50/50'} transition-colors`}
        style={{ height: ROW_HEIGHT }}
      >
        {/* Person label — fixed width */}
        <div
          className="flex-shrink-0 flex items-center gap-2.5 px-4 border-r border-slate-200"
          style={{ width: LABEL_WIDTH }}
        >
          {/* Avatar */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: person.color }}
          >
            {person.name.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-slate-800 truncate">{person.name}</span>
              {conflictCount > 0 && (
                <span className="flex-shrink-0 text-[10px] font-bold text-white bg-red-500 rounded-full w-4 h-4 flex items-center justify-center">
                  {conflictCount}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 truncate">{person.role}</div>

            {/* Workload dots */}
            <div className="flex gap-px mt-0.5">
              {loads.map((load, i) =>
                isWeekend(startDate, i) ? null : (
                  <div
                    key={i}
                    className="rounded-sm"
                    style={{ width: 4, height: 4, background: LOAD_BG[load] }}
                  />
                )
              )}
            </div>
          </div>
        </div>

        {/* Timeline area */}
        <div className="relative flex-1 overflow-hidden">
          {/* Grid columns */}
          {Array.from({ length: sprintDays }, (_, i) => {
            const { isWeekend: wk, isToday } = getDayMeta(startDate, i);
            return (
              <div
                key={i}
                className={`absolute inset-y-0 border-r ${
                  wk ? 'bg-red-50/70 border-red-100'
                    : isToday ? 'bg-cyan-50/40 border-cyan-100'
                    : 'border-slate-100'
                }`}
                style={{ left: i * dayWidth, width: dayWidth }}
              />
            );
          })}

          {/* Workload bar — bottom strip */}
          <div className="absolute bottom-0 left-0 flex" style={{ height: 4 }}>
            {loads.map((load, i) => (
              <div
                key={i}
                style={{
                  width: dayWidth,
                  height: 4,
                  flexShrink: 0,
                  background: isWeekend(startDate, i) ? 'transparent' : LOAD_BG[load],
                }}
              />
            ))}
          </div>

          {/* Phase blocks */}
          {personBlocks.map(block => {
            const isDraggingThis = drag?.taskId === block.taskId;
            const dragOffset = isDraggingThis ? drag!.deltaDays * dayWidth : 0;
            const left = block.startDay * dayWidth + dragOffset;
            const width = (block.endDay - block.startDay) * dayWidth;
            const isConflict = block.hasConflict && !isDraggingThis;
            const isExt = block.isExternal;

            return (
              <div
                key={block.phaseId}
                className={`absolute select-none rounded-md
                  ${isDraggingThis
                    ? 'shadow-lg ring-2 ring-cyan-400 z-10 opacity-90'
                    : isConflict
                      ? 'ring-1 ring-red-400 cursor-grab'
                      : 'hover:brightness-90 cursor-grab'
                  }`}
                style={{
                  top: 6,
                  bottom: 10,
                  left: left + 1,
                  width: Math.max(width - 2, 6),
                  background: isExt ? '#f1f5f9' : isConflict ? '#fecaca' : `${block.taskColor}30`,
                  border: isExt
                    ? '1.5px dashed #94a3b8'
                    : isConflict
                      ? `1px solid #f87171`
                      : `none`,
                  borderLeft: isExt
                    ? '3px dashed #94a3b8'
                    : `3px solid ${isConflict ? '#ef4444' : block.taskColor}`,
                  cursor: isDraggingThis ? 'grabbing' : 'grab',
                  transition: isDraggingThis ? 'none' : undefined,
                  userSelect: 'none',
                }}
                onMouseDown={e => {
                  e.preventDefault();
                  const task = getTask(block.taskId);
                  if (!task) return;
                  setTooltip(null);
                  setDrag({
                    taskId: block.taskId,
                    originalStartDay: task.startDay,
                    mouseStartX: e.clientX,
                    deltaDays: 0,
                  });
                }}
                onMouseUp={_e => {
                  // Click = drag moved 0 days
                  if (drag && drag.deltaDays === 0) {
                    const t = getTask(block.taskId);
                    if (t) setEditingTask(t);
                  }
                }}
                onMouseEnter={e => {
                  if (drag) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    x: rect.left,
                    y: rect.bottom + 8,
                    block,
                    personName: getPerson(block.assigneeId)?.name ?? '—',
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <div className="px-1.5 h-full flex flex-col justify-center overflow-hidden">
                  <div
                    className="text-[11px] font-semibold truncate leading-tight"
                    style={{ color: isExt ? '#64748b' : isConflict ? '#b91c1c' : block.taskColor }}
                  >
                    {block.taskName}
                  </div>
                  {width >= 64 && (
                    <div className={`text-[10px] truncate leading-tight ${isExt ? 'text-slate-400' : isConflict ? 'text-red-400' : 'text-slate-400'}`}>
                      {block.phaseLabel}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Global grabbing cursor while dragging
  useEffect(() => {
    if (drag) {
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [!!drag]);

  return (
    <>
      {/* Single scrolling container — both x and y */}
      <div ref={containerRef} className="h-full overflow-auto">
        <div style={{ minWidth: totalWidth }}>

          {/* Date header — sticky top */}
          <div
            className="flex sticky top-0 z-20 bg-white border-b-2 border-slate-200 shadow-sm"
            style={{ height: HEADER_HEIGHT }}
          >
            <div
              className="flex-shrink-0 flex items-center px-4 border-r border-slate-200 bg-slate-50"
              style={{ width: LABEL_WIDTH }}
            >
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Участник</span>
            </div>
            {Array.from({ length: sprintDays }, (_, i) => {
              const { day, month, dayName, isWeekend: wk, isToday } = getDayMeta(startDate, i);
              return (
                <div
                  key={i}
                  className={`flex-shrink-0 flex flex-col items-center justify-center border-r select-none
                    ${wk ? 'bg-red-50 border-red-200'
                      : isToday ? 'bg-cyan-50 border-cyan-200'
                      : 'bg-white border-slate-200'}`}
                  style={{ width: dayWidth }}
                >
                  <span className={`font-bold text-[11px] ${wk ? 'text-red-400' : isToday ? 'text-cyan-600' : 'text-slate-700'}`}>
                    {String(day).padStart(2, '0')}.{String(month).padStart(2, '0')}
                  </span>
                  <span className={`text-[10px] ${wk ? 'text-red-300' : isToday ? 'text-cyan-400' : 'text-slate-400'}`}>
                    {dayName}{isToday ? ' •' : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Team groups */}
          {teamRows.map(({ team, members }) => (
            <div key={team.id}>
              {/* Team header */}
              <div
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => onToggleTeam(team.id)}
              >
                <svg
                  className={`w-3 h-3 text-slate-400 transition-transform flex-shrink-0 ${team.collapsed ? '' : 'rotate-90'}`}
                  fill="currentColor" viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{team.name}</span>
                <span className="text-[10px] text-slate-400">({members.length})</span>
              </div>
              {!team.collapsed && members.map(renderPersonRow)}
            </div>
          ))}

          {/* Orphan people */}
          {orphans.map(renderPersonRow)}

          {/* Empty state */}
          {people.length === 0 && (
            <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
              Добавьте участников через кнопку «Команда»
            </div>
          )}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-slate-900 text-white text-xs rounded-xl px-4 py-3 shadow-2xl pointer-events-none"
          style={{ left: Math.min(tooltip.x, window.innerWidth - 240), top: tooltip.y }}
        >
          <div className="font-bold text-sm mb-1.5">{tooltip.block.taskName}</div>
          <div className="flex flex-col gap-0.5 text-slate-300">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Фаза</span>
              <span className="font-semibold px-1.5 py-0.5 rounded text-white text-[10px]"
                style={{ background: tooltip.block.taskColor }}>
                {tooltip.block.phaseLabel}
              </span>
            </div>
            <div><span className="text-slate-500">Исполнитель </span>{tooltip.personName}</div>
            <div><span className="text-slate-500">Длит. </span>{formatDuration(tooltip.block.endDay - tooltip.block.startDay)}</div>
          </div>
          {tooltip.block.hasConflict && (
            <div className="mt-2 text-red-400 font-semibold">⚠ Конфликт: исполнитель занят</div>
          )}
        </div>
      )}

      {editingTask && (
        <TaskEditor
          task={editingTask}
          people={people}
          sprintDays={sprintDays}
          startDate={startDate}
          onSave={onUpdateTask}
          onDelete={onDeleteTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </>
  );
}
