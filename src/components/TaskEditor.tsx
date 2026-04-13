import { useState } from 'react';
import type { Task, Phase, Person } from '../types';
import { Modal } from './Modal';
import { generateId } from '../store';
import { daysToHours, hoursToDays, formatDuration, HOURS_PER_DAY, computeTaskPhaseSchedule, isReviewPhase } from '../conflicts';

interface Props {
  task: Task | null;
  people: Person[];
  sprintDays: number;
  startDate: string;
  initialStartDay?: number | null;
  initialAssigneeId?: string | null;
  onSave: (task: Task) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

const DEFAULT_PHASE_LABELS = ['Dev', 'Review', 'Test'];

type PhaseRoleKind = 'dev' | 'test' | null;

function emptyPhase(label: string): Phase {
  return { id: generateId(), label, assigneeId: '', durationDays: 1 };
}

function parseISODateLocal(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12);
}

function formatISODateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysISO(iso: string, days: number): string {
  const date = parseISODateLocal(iso);
  date.setDate(date.getDate() + days);
  return formatISODateLocal(date);
}

function diffDaysISO(fromISO: string, toISO: string): number {
  const from = parseISODateLocal(fromISO);
  const to = parseISODateLocal(toISO);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dayPositionToISO(startDate: string, dayPosition: number): string {
  const safeDayIndex = Math.max(0, Math.ceil(dayPosition) - 1);
  return addDaysISO(startDate, safeDayIndex);
}

function formatHumanDate(iso: string): string {
  return parseISODateLocal(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function getPhaseRoleKind(label: string): PhaseRoleKind {
  const normalized = normalizeText(label);

  if (
    normalized === 'dev' ||
    normalized === 'development' ||
    normalized.includes('разраб') ||
    normalized.includes('разработ')
  ) {
    return 'dev';
  }

  if (
    normalized === 'test' ||
    normalized === 'qa' ||
    normalized.includes('тест') ||
    normalized.includes('qa')
  ) {
    return 'test';
  }

  return null;
}

function isAllowedForPhase(person: Person, phase: Phase): boolean {
  const phaseRoleKind = getPhaseRoleKind(phase.label);
  if (!phaseRoleKind) return true;

  const role = normalizeText(person.role);

  if (phaseRoleKind === 'test') {
    return (
      role.includes('тест') ||
      role.includes('qa') ||
      role.includes('tester') ||
      role.includes('test')
    );
  }

  return true;
}

function formatOffsetDays(days: number): string {
  return formatDuration(days);
}

function applyInitialAssignee(phases: Phase[], people: Person[], initialAssigneeId: string | null): Phase[] {
  if (!initialAssigneeId) return phases;

  const person = people.find(item => item.id === initialAssigneeId);
  if (!person) return phases;

  const phaseIndex = phases.findIndex(phase => isAllowedForPhase(person, phase));
  if (phaseIndex === -1) return phases;

  return phases.map((phase, index) =>
    index === phaseIndex ? { ...phase, assigneeId: initialAssigneeId } : phase
  );
}

export function TaskEditor({
  task,
  people,
  sprintDays,
  startDate,
  initialStartDay = null,
  initialAssigneeId = null,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [name, setName] = useState(task?.name ?? '');
  const [sprintGoal, setSprintGoal] = useState(task?.sprintGoal ?? false);
  const sprintEndDate = addDaysISO(startDate, Math.max(sprintDays - 1, 0));
  const initialStartDate = addDaysISO(
    startDate,
    clamp(task?.startDay ?? initialStartDay ?? 0, 0, Math.max(sprintDays - 1, 0))
  );
  const [selectedStartDate, setSelectedStartDate] = useState(initialStartDate);
  const [phases, setPhases] = useState<Phase[]>(
    task?.phases.length
      ? task.phases
      : applyInitialAssignee(DEFAULT_PHASE_LABELS.map(emptyPhase), people, initialAssigneeId)
  );

  const updatePhase = (idx: number, patch: Partial<Phase>) =>
    setPhases(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));

  const addPhase = () =>
    setPhases(prev => [...prev, emptyPhase(`Фаза ${prev.length + 1}`)]);

  const removePhase = (idx: number) =>
    setPhases(prev => prev.filter((_, i) => i !== idx));

  const movePhase = (idx: number, dir: -1 | 1) => {
    const next = [...phases];
    const s = idx + dir;
    if (s < 0 || s >= next.length) return;
    [next[idx], next[s]] = [next[s], next[idx]];
    setPhases(next);
  };

  const totalDuration = phases.reduce((s, p) => s + (p.durationDays || 0), 0);
  const startDay = clamp(diffDaysISO(startDate, selectedStartDate), 0, Math.max(sprintDays - 1, 0));
  const previewTask: Task = {
    id: task?.id ?? 'preview',
    name: name.trim() || 'preview',
    sprintGoal,
    startDay,
    sprintStartDate: task?.sprintStartDate ?? '',
    phases,
  };
  const phaseSchedule = computeTaskPhaseSchedule(previewTask, startDate);
  const completionDayPosition = phaseSchedule.reduce((max, phase) => Math.max(max, phase.endDay), startDay);
  const completionDate = dayPositionToISO(startDate, completionDayPosition);
  const overflow = completionDayPosition > sprintDays;

  const handleSave = () => {
    const n = name.trim();
    if (!n) return;
    onSave({
      id: task?.id ?? generateId(),
      name: n,
      sprintGoal,
      startDay,
      sprintStartDate: task?.sprintStartDate ?? '',
      phases: phases.filter(p => p.durationDays > 0),
    });
    onClose();
  };

  return (
    <Modal title={task ? 'Редактировать задачу' : 'Новая задача'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Name */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Название</label>
          <input
            autoFocus
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            placeholder="Например: PROJ-42 Авторизация"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
            <div>Дата начала: {formatHumanDate(selectedStartDate)}</div>
            <div>Предполагаемая дата завершения: {formatHumanDate(completionDate)}</div>
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400"
            checked={sprintGoal}
            onChange={e => setSprintGoal(e.target.checked)}
          />
          <div>
            <div className="text-sm font-medium text-slate-700">Цель спринта</div>
            <div className="text-xs text-slate-400">Отмеченные задачи будут отображаться с огоньком.</div>
          </div>
        </label>

        {/* Start date */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
            Дата начала <span className="font-normal text-slate-400 normal-case">(только в пределах спринта)</span>
          </label>
          <input
            type="date"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            value={selectedStartDate}
            min={startDate}
            max={sprintEndDate}
            onChange={e => setSelectedStartDate(e.target.value || initialStartDate)}
          />
          <p className="mt-1 text-xs text-slate-400">
            День {startDay + 1} спринта · {parseISODateLocal(selectedStartDate).toLocaleDateString('ru-RU', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>

        {/* Phases */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Фазы</label>
            <button onClick={addPhase} className="text-xs text-cyan-600 hover:text-cyan-800 font-medium">
              + Добавить фазу
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {phases.map((phase, idx) => {
              const phaseRoleKind = getPhaseRoleKind(phase.label);
              const isReview = isReviewPhase(phase.label);
              const filteredPeople = people.filter(person => isAllowedForPhase(person, phase));
              const selectedPerson = people.find(person => person.id === phase.assigneeId);
              const selectedPersonAllowed =
                !selectedPerson || filteredPeople.some(person => person.id === selectedPerson.id);

              return (
                <div key={phase.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => movePhase(idx, -1)} disabled={idx === 0}
                      className="text-slate-300 hover:text-slate-500 disabled:opacity-20 text-[10px] leading-none">▲</button>
                    <button onClick={() => movePhase(idx, 1)} disabled={idx === phases.length - 1}
                      className="text-slate-300 hover:text-slate-500 disabled:opacity-20 text-[10px] leading-none">▼</button>
                  </div>
                  <input
                    className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    value={phase.label}
                    onChange={e => {
                      const newLabel = e.target.value;
                      updatePhase(idx, {
                        label: newLabel,
                        assigneeId: isReviewPhase(newLabel) ? '' : phase.assigneeId,
                      });
                    }}
                  />
                  <button onClick={() => removePhase(idx)} className="text-red-300 hover:text-red-500 font-bold text-lg leading-none">×</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Исполнитель</label>
                    {isReview ? (
                      <div className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-500 flex items-center gap-1.5">
                        <span>👥</span>
                        <span className="font-medium">Внешние ревьюеры</span>
                      </div>
                    ) : (
                      <>
                        <select
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-400"
                          value={phase.assigneeId}
                          onChange={e => updatePhase(idx, { assigneeId: e.target.value })}
                        >
                          <option value="">— без исполнителя —</option>
                          {!selectedPersonAllowed && selectedPerson && (
                            <option value={selectedPerson.id}>
                              {selectedPerson.name} ({selectedPerson.role}) — недоступно для этой фазы
                            </option>
                          )}
                          {filteredPeople.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                          ))}
                        </select>
                        {phaseRoleKind === 'test' && (
                          <div className="mt-1 text-[10px] text-slate-400">Для фазы Test доступны только тестировщики.</div>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      Часов
                      <span className="ml-1 text-slate-300">= {formatDuration(phase.durationDays)}</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={sprintDays * HOURS_PER_DAY}
                      step={1}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-400"
                      value={daysToHours(phase.durationDays)}
                      onChange={e => updatePhase(idx, {
                        durationDays: hoursToDays(Math.max(1, Math.round(Number(e.target.value))))
                      })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      Старт через
                      <span className="ml-1 text-slate-300">
                        {typeof phase.startAfterDays === 'number'
                          ? `= ${formatOffsetDays(phase.startAfterDays)}`
                          : '= после прошлой фазы'}
                      </span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={sprintDays * HOURS_PER_DAY}
                      step={1}
                      placeholder="по цепочке"
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-400"
                      value={typeof phase.startAfterDays === 'number' ? daysToHours(phase.startAfterDays) : ''}
                      onChange={e => {
                        const value = e.target.value.trim();
                        updatePhase(idx, {
                          startAfterDays: value === ''
                            ? undefined
                            : hoursToDays(Math.max(0, Math.round(Number(value))))
                        });
                      }}
                    />
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white/70 px-2 py-1.5 text-[10px] text-slate-500">
                    Если указать значение, фаза стартует через это время после начала задачи, даже если предыдущая ещё не закончилась.
                  </div>
                </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <div className={`text-xs rounded-xl px-3 py-2.5 ${overflow ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-600'}`}>
          {overflow ? '⚠ ' : 'ℹ '}
          Итого: {daysToHours(totalDuration)}ч ({formatDuration(totalDuration)}) · выходные пропускаются
          {overflow && ` · выходит за пределы спринта (${sprintDays * HOURS_PER_DAY}ч)`}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2 border-t border-slate-200">
          {task && onDelete && (
            <button onClick={() => { onDelete(task.id); onClose(); }}
              className="mr-auto text-xs text-red-400 hover:text-red-600">
              Удалить задачу
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 font-medium transition-colors"
          >
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  );
}
