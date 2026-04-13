import { useState, useEffect, useRef } from 'react';
import type { Person, Task, PhaseBlock, DayLoad } from '../types';
import { computePersonLoad, formatDuration, HOURS_PER_DAY, EXTERNAL_REVIEWER_ID } from '../conflicts';
import { TaskEditor } from './TaskEditor';

interface Props {
  people: Person[];
  tasks: Task[];
  blocks: PhaseBlock[];
  sprintDays: number;
  startDate: string;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onCreateTaskAtDay: (day: number, personId: string) => void;
}

const LABEL_WIDTH = 200;
const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 52;
const MIN_DAY_WIDTH = 24; // px — minimum before horizontal scroll kicks in
const BLOCK_TOP = 6;
const BLOCK_HEIGHT = 36;
const BLOCK_GAP = 6;
const BLOCK_BOTTOM = 10;

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
  mode: 'task' | 'phase';
  taskId: string;
  phaseId: string;
  originalStartDay: number;
  minStartDay: number;
  mouseStartX: number;
  deltaDays: number;
}

interface BlockLaneLayout {
  laneByPhaseId: Map<string, number>;
  laneCount: number;
}

interface PersonRowData {
  person: Person;
  personBlocks: PhaseBlock[];
  loads: DayLoad[];
  overloaded: boolean;
  conflictCount: number;
  laneLayout: BlockLaneLayout;
  conflictDays: Set<number>;
  rowHeight: number;
}

interface PositionedPersonRow extends PersonRowData {
  top: number;
}

function buildBlockLaneLayout(blocks: PhaseBlock[]): BlockLaneLayout {
  const laneByPhaseId = new Map<string, number>();
  const laneEndDays: number[] = [];
  const laneOccupiedDays: Array<Set<number>> = [];

  const sortedBlocks = [...blocks].sort((a, b) => {
    if (a.startDay !== b.startDay) return a.startDay - b.startDay;
    if (a.endDay !== b.endDay) return a.endDay - b.endDay;
    return a.phaseId.localeCompare(b.phaseId);
  });

  for (const block of sortedBlocks) {
    const startCalendarDay = Math.floor(block.startDay);
    const endCalendarDay = Math.max(startCalendarDay, Math.ceil(block.endDay) - 1);

    let lane = laneEndDays.findIndex((endDay, laneIndex) => {
      if (endDay > block.startDay) return false;

      const occupiedDays = laneOccupiedDays[laneIndex] ?? new Set<number>();
      for (let day = startCalendarDay; day <= endCalendarDay; day++) {
        if (occupiedDays.has(day)) {
          return false;
        }
      }

      return true;
    });

    if (lane === -1) {
      lane = laneEndDays.length;
      laneEndDays.push(block.endDay);
      laneOccupiedDays.push(new Set<number>());
    } else {
      laneEndDays[lane] = block.endDay;
    }

    const occupiedDays = laneOccupiedDays[lane];
    for (let day = startCalendarDay; day <= endCalendarDay; day++) {
      occupiedDays.add(day);
    }

    laneByPhaseId.set(block.phaseId, lane);
  }

  return {
    laneByPhaseId,
    laneCount: Math.max(1, laneEndDays.length),
  };
}

function getVisualBlockBounds(block: PhaseBlock) {
  const visualStartDay = Math.floor(block.startDay);
  const visualEndDay = Math.max(visualStartDay + 1, Math.ceil(block.endDay));

  return {
    visualStartDay,
    visualEndDay,
  };
}

function getConflictDays(personBlocks: PhaseBlock[], totalDays: number): Set<number> {
  const days = new Set<number>();

  for (let day = 0; day < totalDays; day++) {
    let totalLoad = 0;
    for (const block of personBlocks) {
      if (block.isExternal) continue;
      const overlapStart = Math.max(block.startDay, day);
      const overlapEnd = Math.min(block.endDay, day + 1);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      totalLoad += overlap;
    }
    if (totalLoad > 1 + 1e-9) {
      days.add(day);
    }
  }

  return days;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function isTestPhase(label: string): boolean {
  const normalized = normalizeText(label);
  return (
    normalized === 'test' ||
    normalized === 'qa' ||
    normalized.includes('тест') ||
    normalized.includes('qa')
  );
}


function getBlockHoursForDay(block: PhaseBlock, day: number): number {
  const overlapStart = Math.max(block.startDay, day);
  const overlapEnd = Math.min(block.endDay, day + 1);
  const overlapDays = Math.max(0, overlapEnd - overlapStart);
  return Math.round(overlapDays * HOURS_PER_DAY);
}

function getRoleSortPriority(role: string): number {
  const normalized = normalizeText(role);

  if (
    normalized.includes('тест') ||
    normalized.includes('qa') ||
    normalized.includes('tester') ||
    normalized.includes('test')
  ) {
    return 0;
  }

  if (
    normalized.includes('разработ') ||
    normalized.includes('developer') ||
    normalized.includes('dev')
  ) {
    return 1;
  }

  return 2;
}

function sortPeopleForTimeline(items: Person[]): Person[] {
  return [...items].sort((a, b) => {
    const rolePriority = getRoleSortPriority(a.role) - getRoleSortPriority(b.role);
    if (rolePriority !== 0) return rolePriority;
    return a.name.localeCompare(b.name, 'ru');
  });
}

export function TimelineGrid({
  people, tasks, blocks, sprintDays, startDate,
  onUpdateTask, onDeleteTask, onCreateTaskAtDay,
}: Props) {
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
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
      const newStart = Math.max(d.minStartDay, d.originalStartDay + rawDelta);
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
        const newStartDay = Math.max(d.minStartDay, d.originalStartDay + d.deltaDays);
        if (d.mode === 'phase') {
          const phase = task.phases.find(item => item.id === d.phaseId);
          const nextStartAfterDays = Math.max(0, newStartDay - task.startDay);
          if (phase && phase.startAfterDays !== nextStartAfterDays) {
            onUpdateTask({
              ...task,
              phases: task.phases.map(item =>
                item.id === d.phaseId
                  ? { ...item, startAfterDays: nextStartAfterDays }
                  : item
              ),
            });
          }
        } else if (newStartDay !== task.startDay) {
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

  const sortedPeople = sortPeopleForTimeline(people);

  const rowDataByPersonId = new Map<string, PersonRowData>(
    people.map(person => {
      const personBlocks = blocks.filter(b => b.assigneeId === person.id);
      const loads: DayLoad[] = computePersonLoad(person.id, blocks, sprintDays);
      const overloaded = loads.some(l => l === 2);
      const conflictCount = personBlocks.filter(b => b.hasConflict).length;
      const laneLayout = buildBlockLaneLayout(personBlocks);
      const conflictDays = getConflictDays(personBlocks, sprintDays);
      const rowHeight = Math.max(
        ROW_HEIGHT,
        BLOCK_TOP + laneLayout.laneCount * BLOCK_HEIGHT + (laneLayout.laneCount - 1) * BLOCK_GAP + BLOCK_BOTTOM
      );

      return [person.id, {
        person,
        personBlocks,
        loads,
        overloaded,
        conflictCount,
        laneLayout,
        conflictDays,
        rowHeight,
      }];
    })
  );

  const positionedRows: PositionedPersonRow[] = [];
  let bodyHeight = 0;

  for (const person of sortedPeople) {
    const rowData = rowDataByPersonId.get(person.id);
    if (!rowData) continue;
    positionedRows.push({ ...rowData, top: bodyHeight });
    bodyHeight += rowData.rowHeight;
  }

  const selectedTask = selectedTaskId ? getTask(selectedTaskId) : null;
  const selectedBlockPositions = new Map<string, { left: number; right: number; top: number; bottom: number; centerY: number }>();

  if (selectedTask) {
    for (const row of positionedRows) {
      for (const block of row.personBlocks) {
        if (block.taskId !== selectedTask.id) continue;
        const lane = row.laneLayout.laneByPhaseId.get(block.phaseId) ?? 0;
        const { visualStartDay, visualEndDay } = getVisualBlockBounds(block);
        const top = row.top + BLOCK_TOP + lane * (BLOCK_HEIGHT + BLOCK_GAP);
        selectedBlockPositions.set(block.phaseId, {
          left: visualStartDay * dayWidth + 1,
          right: visualEndDay * dayWidth - 1,
          top,
          bottom: top + BLOCK_HEIGHT,
          centerY: top + BLOCK_HEIGHT / 2,
        });
      }
    }
  }

  const selectedTaskConnections = selectedTask
    ? selectedTask.phases
        .map(phase => selectedBlockPositions.get(phase.id))
        .flatMap((position, index, all) => {
          const next = all[index + 1];
          if (!position || !next) return [];
          return [{ from: position, to: next }];
        })
    : [];

  const renderPersonRow = (person: Person) => {
    const rowData = rowDataByPersonId.get(person.id);
    if (!rowData) return null;
    const { personBlocks, loads, overloaded, conflictCount, laneLayout, conflictDays, rowHeight } = rowData;
    return (
      <div
        key={person.id}
        className={`flex border-b border-slate-100 ${overloaded ? 'bg-red-50/30' : 'bg-white hover:bg-slate-50/50'} transition-colors`}
        style={{ height: rowHeight }}
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
        <div
          className="relative flex-1 overflow-hidden"
          onClick={event => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-task-block="true"]')) return;

            const rect = event.currentTarget.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const day = Math.min(
              sprintDays - 1,
              Math.max(0, Math.floor(offsetX / dayWidth))
            );

            onCreateTaskAtDay(day, person.id);
          }}
        >
          {/* Grid columns */}
          {Array.from({ length: sprintDays }, (_, i) => {
            const { isWeekend: wk, isToday } = getDayMeta(startDate, i);
            const isConflictDay = conflictDays.has(i);
            return (
              <div
                key={i}
                className={`absolute inset-y-0 border-r ${
                  isConflictDay ? 'bg-red-100/70 border-red-200'
                    : wk ? 'bg-red-50/70 border-red-100'
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
            const isDraggingThis =
              drag?.mode === 'phase'
                ? drag.phaseId === block.phaseId
                : drag?.taskId === block.taskId;
            const dragOffset = isDraggingThis ? drag!.deltaDays * dayWidth : 0;
            const { visualStartDay, visualEndDay } = getVisualBlockBounds(block);
            const left = visualStartDay * dayWidth + dragOffset;
            const width = (visualEndDay - visualStartDay) * dayWidth;
            const isConflict = block.hasConflict && !isDraggingThis;
            const isExt = block.isExternal;
            const lane = laneLayout.laneByPhaseId.get(block.phaseId) ?? 0;
            const top = BLOCK_TOP + lane * (BLOCK_HEIGHT + BLOCK_GAP);
            const isSelectedTask = selectedTaskId === block.taskId;
            const isDimmed = selectedTaskId !== null && !isSelectedTask;
            const boxShadow = isDraggingThis
              ? '0 12px 24px rgba(6, 182, 212, 0.18)'
              : isSelectedTask
                ? '0 0 0 2px rgba(14, 165, 233, 0.35), 0 14px 28px rgba(14, 165, 233, 0.18)'
              : isConflict
                ? '0 0 0 2px rgba(239, 68, 68, 0.28), 0 10px 20px rgba(239, 68, 68, 0.12)'
                : undefined;

            return (
              <div
                key={block.phaseId}
                className={`absolute select-none rounded-md
                  ${isDraggingThis
                    ? 'shadow-lg ring-2 ring-cyan-400 z-10 opacity-90'
                    : isSelectedTask
                      ? 'ring-2 ring-sky-400 z-10'
                    : isConflict
                      ? 'ring-1 ring-red-400 cursor-grab'
                      : 'hover:brightness-90 cursor-grab'
                  }`}
                data-task-block="true"
                style={{
                  top,
                  height: BLOCK_HEIGHT,
                  left: left + 1,
                  width: Math.max(width - 2, 6),
                  background: isExt ? '#f1f5f9' : isConflict ? '#fee2e2' : `${block.taskColor}30`,
                  border: isExt
                    ? '1.5px dashed #94a3b8'
                    : isConflict
                      ? '1px solid #ef4444'
                      : `none`,
                  borderLeft: isExt
                    ? '3px dashed #94a3b8'
                    : `3px solid ${isConflict ? '#ef4444' : block.taskColor}`,
                  boxShadow,
                  cursor: isDraggingThis ? 'grabbing' : 'grab',
                  opacity: isDimmed ? 0.14 : 1,
                  transition: isDraggingThis ? 'none' : undefined,
                  userSelect: 'none',
                  zIndex: isSelectedTask ? 15 : isConflict ? 8 : 5,
                }}
                onMouseDown={e => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  const task = getTask(block.taskId);
                  if (!task) return;
                  const dragMode: DragState['mode'] = isTestPhase(block.phaseLabel) ? 'phase' : 'task';
                  setTooltip(null);
                  setDrag({
                    mode: dragMode,
                    taskId: block.taskId,
                    phaseId: block.phaseId,
                    originalStartDay: dragMode === 'phase' ? block.startDay : task.startDay,
                    minStartDay: dragMode === 'phase' ? task.startDay : 0,
                    mouseStartX: e.clientX,
                    deltaDays: 0,
                  });
                }}
                onMouseUp={_e => {
                  // Click = drag moved 0 days
                  if (drag && drag.deltaDays === 0) {
                    setSelectedTaskId(block.taskId);
                  }
                }}
                onContextMenu={e => {
                  e.preventDefault();
                  const task = getTask(block.taskId);
                  if (task) setEditingTask(task);
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
                {isConflict && (
                  <div className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-sm pointer-events-none">
                    !
                  </div>
                )}
                {(() => {
                  const task = getTask(block.taskId);
                  const phase = task?.phases.find(p => p.id === block.phaseId);
                  const phaseHours = phase ? Math.round(phase.durationDays * HOURS_PER_DAY) : 0;
                  const blockDuration = block.endDay - block.startDay;
                  const isMultiDay = blockDuration > 1;
                  const textColor = isExt ? '#64748b' : isConflict ? '#b91c1c' : block.taskColor;

                  return (
                    <>
                      <div className="px-1.5 h-full flex flex-col justify-center overflow-hidden pr-5">
                        <div
                          className="text-[11px] font-semibold truncate leading-tight flex items-baseline gap-1"
                          style={{ color: textColor }}
                        >
                          <span className="truncate">
                            {block.taskName}
                            {block.taskIsSprintGoal ? ' 🔥' : ''}
                          </span>
                          {phaseHours > 0 && width >= 44 && (
                            <span
                              className="flex-shrink-0 text-[9px] font-normal leading-none rounded px-0.5"
                              style={{ color: textColor, opacity: 0.65, background: `${block.taskColor}18` }}
                            >
                              {phaseHours}ч
                            </span>
                          )}
                        </div>
                        {width >= 64 && (
                          <div className={`text-[10px] truncate leading-tight ${isExt ? 'text-slate-400' : isConflict ? 'text-red-400' : 'text-slate-400'}`}>
                            {block.phaseLabel}
                          </div>
                        )}
                      </div>

                      {/* Per-day hour labels for multi-day blocks */}
                      {isMultiDay && Array.from({ length: visualEndDay - visualStartDay }, (_, i) => {
                        const day = visualStartDay + i;
                        const dayHours = getBlockHoursForDay(block, day);
                        if (dayHours === 0) return null;
                        return (
                          <div
                            key={day}
                            className="absolute bottom-1 pointer-events-none flex items-center justify-center"
                            style={{
                              left: i * dayWidth + 2,
                              width: dayWidth - 4,
                            }}
                          >
                            <span
                              className="text-[8px] font-semibold leading-none px-0.5 py-px rounded"
                              style={{
                                color: isExt ? '#64748b' : isConflict ? '#b91c1c' : block.taskColor,
                                background: isExt ? '#e2e8f0' : `${block.taskColor}20`,
                                opacity: 0.9,
                              }}
                            >
                              {dayHours}ч
                            </span>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
                {isConflict && (
                  <div
                    className="absolute left-2 right-2 pointer-events-none"
                    style={{
                      top: BLOCK_HEIGHT + 2,
                      borderTop: '1px dashed rgba(239, 68, 68, 0.45)',
                    }}
                  />
                )}
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

  useEffect(() => {
    if (!selectedTaskId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-task-block="true"]')) return;
      setSelectedTaskId(null);
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [selectedTaskId]);

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

          <div className="relative">
            {selectedTaskConnections.length > 0 && (
              <svg
                className="absolute top-0 pointer-events-none z-10 overflow-visible"
                style={{ left: LABEL_WIDTH, width: sprintDays * dayWidth, height: bodyHeight }}
              >
                {selectedTaskConnections.map(({ from, to }, index) => {
                  const entersFromTop = to.centerY > from.centerY;
                  const targetY = entersFromTop ? to.top : to.bottom;
                  const sourceY = entersFromTop ? from.bottom : from.top;
                  const elbowX = from.right + Math.max(16, (to.left - from.right) / 2);
                  const targetX = to.left + (to.right - to.left) / 2;
                  const path = `M ${from.right} ${sourceY} L ${elbowX} ${sourceY} L ${elbowX} ${targetY} L ${targetX} ${targetY}`;

                  return (
                    <path
                      key={index}
                      d={path}
                      fill="none"
                      stroke="#0ea5e9"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="6 5"
                    />
                  );
                })}
              </svg>
            )}

            {/* People rows */}
            {sortedPeople.map(renderPersonRow)}

            {/* Empty state */}
            {people.length === 0 && (
              <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
                Добавьте участников через кнопку «Команда»
              </div>
            )}

            {/* External reviewers row */}
            {(() => {
              const reviewBlocks = blocks.filter(b => b.assigneeId === EXTERNAL_REVIEWER_ID);
              if (reviewBlocks.length === 0) return null;
              const laneLayout = buildBlockLaneLayout(reviewBlocks);
              const rowHeight = Math.max(
                ROW_HEIGHT,
                BLOCK_TOP + laneLayout.laneCount * BLOCK_HEIGHT + (laneLayout.laneCount - 1) * BLOCK_GAP + BLOCK_BOTTOM
              );
              return (
                <div className="flex border-t-2 border-slate-300 bg-slate-50/60" style={{ height: rowHeight }}>
                  {/* Label */}
                  <div
                    className="flex-shrink-0 flex items-center gap-2.5 px-4 border-r border-slate-200"
                    style={{ width: LABEL_WIDTH }}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-300 text-slate-600 text-sm flex-shrink-0">
                      👥
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-600 truncate">Внешние ревьюеры</div>
                      <div className="text-[10px] text-slate-400 truncate">Code Review</div>
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

                    {/* Review blocks */}
                    {reviewBlocks.map(block => {
                      const isDraggingThis = drag?.phaseId === block.phaseId;
                      const dragOffset = isDraggingThis ? drag!.deltaDays * dayWidth : 0;
                      const { visualStartDay, visualEndDay } = getVisualBlockBounds(block);
                      const left = visualStartDay * dayWidth + dragOffset;
                      const width = (visualEndDay - visualStartDay) * dayWidth;
                      const lane = laneLayout.laneByPhaseId.get(block.phaseId) ?? 0;
                      const top = BLOCK_TOP + lane * (BLOCK_HEIGHT + BLOCK_GAP);
                      const isSelectedTask = selectedTaskId === block.taskId;
                      const isDimmed = selectedTaskId !== null && !isSelectedTask;
                      const blockDuration = block.endDay - block.startDay;
                      const isMultiDay = blockDuration > 1;
                      const task = getTask(block.taskId);
                      const phase = task?.phases.find(p => p.id === block.phaseId);
                      const phaseHours = phase ? Math.round(phase.durationDays * HOURS_PER_DAY) : 0;

                      return (
                        <div
                          key={block.phaseId}
                          className={`absolute select-none rounded-md
                            ${isDraggingThis
                              ? 'shadow-lg ring-2 ring-cyan-400 z-10 opacity-90'
                              : isSelectedTask
                                ? 'ring-2 ring-sky-400 z-10'
                              : 'hover:brightness-90 cursor-grab'
                            }`}
                          data-task-block="true"
                          style={{
                            top,
                            height: BLOCK_HEIGHT,
                            left: left + 1,
                            width: Math.max(width - 2, 6),
                            background: `${block.taskColor}20`,
                            border: 'none',
                            borderLeft: `3px solid ${block.taskColor}`,
                            cursor: isDraggingThis ? 'grabbing' : 'grab',
                            opacity: isDimmed ? 0.14 : 1,
                            transition: isDraggingThis ? 'none' : undefined,
                            userSelect: 'none',
                            zIndex: isSelectedTask ? 15 : 5,
                          }}
                          onMouseDown={e => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            if (!task) return;
                            setTooltip(null);
                            setDrag({
                              mode: 'phase',
                              taskId: block.taskId,
                              phaseId: block.phaseId,
                              originalStartDay: block.startDay,
                              minStartDay: task.startDay,
                              mouseStartX: e.clientX,
                              deltaDays: 0,
                            });
                          }}
                          onMouseUp={() => {
                            if (drag && drag.deltaDays === 0) setSelectedTaskId(block.taskId);
                          }}
                          onContextMenu={e => {
                            e.preventDefault();
                            if (task) setEditingTask(task);
                          }}
                          onMouseEnter={e => {
                            if (drag) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({ x: rect.left, y: rect.bottom + 8, block, personName: 'Внешние ревьюеры' });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <div className="px-1.5 h-full flex flex-col justify-center overflow-hidden pr-2">
                            <div
                              className="text-[11px] font-semibold truncate leading-tight flex items-baseline gap-1"
                              style={{ color: block.taskColor }}
                            >
                              <span className="truncate">
                                {block.taskName}
                                {block.taskIsSprintGoal ? ' 🔥' : ''}
                              </span>
                              {phaseHours > 0 && width >= 44 && (
                                <span
                                  className="flex-shrink-0 text-[9px] font-normal leading-none rounded px-0.5"
                                  style={{ color: block.taskColor, opacity: 0.65, background: `${block.taskColor}18` }}
                                >
                                  {phaseHours}ч
                                </span>
                              )}
                            </div>
                            {width >= 64 && (
                              <div className="text-[10px] truncate leading-tight text-slate-400">
                                {block.phaseLabel}
                              </div>
                            )}
                          </div>
                          {isMultiDay && Array.from({ length: visualEndDay - visualStartDay }, (_, i) => {
                            const day = visualStartDay + i;
                            const dayHours = getBlockHoursForDay(block, day);
                            if (dayHours === 0) return null;
                            return (
                              <div
                                key={day}
                                className="absolute bottom-1 pointer-events-none flex items-center justify-center"
                                style={{ left: i * dayWidth + 2, width: dayWidth - 4 }}
                              >
                                <span
                                  className="text-[8px] font-semibold leading-none px-0.5 py-px rounded"
                                  style={{ color: block.taskColor, background: `${block.taskColor}20`, opacity: 0.9 }}
                                >
                                  {dayHours}ч
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-slate-900 text-white text-xs rounded-xl px-4 py-3 shadow-2xl pointer-events-none"
          style={{ left: Math.min(tooltip.x, window.innerWidth - 240), top: tooltip.y }}
        >
          <div className="font-bold text-sm mb-1.5">
            {tooltip.block.taskName}
            {tooltip.block.taskIsSprintGoal ? ' 🔥' : ''}
          </div>
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
