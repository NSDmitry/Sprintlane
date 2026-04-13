import { useState, useRef } from 'react';
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

function formatHours(hours: number): string {
  const d = Math.floor(hours / HOURS_PER_DAY);
  const h = hours % HOURS_PER_DAY;
  if (d > 0 && h > 0) return `${d}d ${h}h`;
  if (d > 0) return `${d}d`;
  return `${h}h`;
}

function parseHours(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  let total = 0;
  let matched = false;

  // Match patterns like "2d", "2h", "2d 3h", "2d3h"
  const dayMatch = s.match(/(\d+(?:\.\d+)?)\s*d/);
  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*h/);

  if (dayMatch) { total += parseFloat(dayMatch[1]) * HOURS_PER_DAY; matched = true; }
  if (hourMatch) { total += parseFloat(hourMatch[1]); matched = true; }

  // Plain number — treat as hours
  if (!matched) {
    const n = parseFloat(s);
    if (!isNaN(n)) { total = n; matched = true; }
  }

  if (!matched || total < 1) return null;
  return Math.round(total);
}

function HoursInput({ hours, max, onChange }: { hours: number; max: number; onChange: (h: number) => void }) {
  const [draft, setDraft] = useState(() => formatHours(hours));
  const [invalid, setInvalid] = useState(false);
  const committedHours = useRef(hours);

  // Sync when external value changes (e.g. phase reorder)
  if (committedHours.current !== hours) {
    committedHours.current = hours;
    setDraft(formatHours(hours));
    setInvalid(false);
  }

  const commit = () => {
    const parsed = parseHours(draft);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    const clamped = clamp(parsed, 1, max);
    committedHours.current = clamped;
    setDraft(formatHours(clamped));
    setInvalid(false);
    if (clamped !== hours) onChange(clamped);
  };

  return (
    <input
      type="text"
      className={`w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 ${
        invalid
          ? 'border-red-400 focus:ring-red-400 bg-red-50'
          : 'border-slate-300 focus:ring-cyan-400'
      }`}
      placeholder="напр. 2d 4h"
      value={draft}
      onChange={e => { setDraft(e.target.value); setInvalid(false); }}
      onBlur={commit}
      onKeyDown={e => e.key === 'Enter' && commit()}
    />
  );
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
    setPhases(prev => [...prev, emptyPhase('Dev')]);

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
                  <select
                    className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white"
                    value={phase.label}
                    onChange={e => {
                      const newLabel = e.target.value;
                      updatePhase(idx, {
                        label: newLabel,
                        assigneeId: isReviewPhase(newLabel) ? '' : phase.assigneeId,
                      });
                    }}
                  >
                    <option value="Dev">Dev</option>
                    <option value="Review">Review</option>
                    <option value="Test">Test</option>
                  </select>
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
                      Оценка
                    </label>
                    <HoursInput
                      hours={daysToHours(phase.durationDays)}
                      max={sprintDays * HOURS_PER_DAY}
                      onChange={h => updatePhase(idx, { durationDays: hoursToDays(h) })}
                    />
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
