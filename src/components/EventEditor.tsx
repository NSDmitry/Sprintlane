import { useState } from 'react';
import type { SprintEvent, SprintEventType, Person } from '../types';
import { Modal } from './Modal';
import { generateId } from '../store';
import { HOURS_PER_DAY, formatDuration } from '../conflicts';

interface Props {
  event: SprintEvent | null;
  people: Person[];
  sprintDays: number;
  startDate: string;
  initialStartDay?: number | null;
  initialPersonId?: string | null;
  onSave: (event: SprintEvent) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

const EVENT_LABELS: Record<SprintEventType, string> = {
  vacation: 'Отпуск',
  regression: 'Регресс',
  smoke: 'Смоук',
};

const EVENT_COLORS: Record<SprintEventType, { bg: string; border: string; text: string }> = {
  vacation: { bg: '#f1f5f9', border: '#64748b', text: '#475569' },
  regression: { bg: '#fff7ed', border: '#f97316', text: '#c2410c' },
  smoke: { bg: '#f0fdfa', border: '#14b8a6', text: '#0f766e' },
};

function parseHours(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  let total = 0;
  let matched = false;

  const dayMatchRu = s.match(/(\d+(?:\.\d+)?)\s*д/);
  const hourMatchRu = s.match(/(\d+(?:\.\d+)?)\s*ч/);
  const dayMatch = s.match(/(\d+(?:\.\d+)?)\s*d/);
  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*h/);

  if (dayMatchRu) { total += parseFloat(dayMatchRu[1]) * HOURS_PER_DAY; matched = true; }
  else if (dayMatch) { total += parseFloat(dayMatch[1]) * HOURS_PER_DAY; matched = true; }
  if (hourMatchRu) { total += parseFloat(hourMatchRu[1]); matched = true; }
  else if (hourMatch) { total += parseFloat(hourMatch[1]); matched = true; }

  if (!matched) {
    const n = parseFloat(s);
    if (!isNaN(n)) { total = n; matched = true; }
  }

  if (!matched || total < 1) return null;
  return Math.round(total);
}

function formatHours(hours: number): string {
  const d = Math.floor(hours / HOURS_PER_DAY);
  const h = hours % HOURS_PER_DAY;
  if (d > 0 && h > 0) return `${d}д ${h}ч`;
  if (d > 0) return `${d}д`;
  return `${h}ч`;
}

function parseISODateLocal(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12);
}

function addDaysISO(iso: string, days: number): string {
  const date = parseISODateLocal(iso);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatHumanDate(iso: string): string {
  return parseISODateLocal(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function diffDaysISO(fromISO: string, toISO: string): number {
  const from = parseISODateLocal(fromISO);
  const to = parseISODateLocal(toISO);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export function EventEditor({
  event, people, sprintDays, startDate,
  initialStartDay, initialPersonId,
  onSave, onDelete, onClose,
}: Props) {
  const isNew = !event;

  const sprintEndDate = addDaysISO(startDate, Math.max(sprintDays - 1, 0));

  const [type, setType] = useState<SprintEventType>(event?.type ?? 'vacation');
  const [personId, setPersonId] = useState<string>(
    event?.personId ?? initialPersonId ?? people[0]?.id ?? ''
  );
  const initialDateISO = addDaysISO(startDate, event?.startDay ?? initialStartDay ?? 0);
  const [selectedDate, setSelectedDate] = useState<string>(initialDateISO);
  const [durationDraft, setDurationDraft] = useState<string>(() => {
    const h = event ? Math.round(event.durationDays * HOURS_PER_DAY) : HOURS_PER_DAY;
    return formatHours(h);
  });
  const [durationInvalid, setDurationInvalid] = useState(false);

  const startDay = Math.max(0, Math.min(sprintDays - 1, diffDaysISO(startDate, selectedDate)));
  const parsedHours = parseHours(durationDraft);
  const durationDays = parsedHours !== null ? parsedHours / HOURS_PER_DAY : null;

  const endDateISO = durationDays !== null
    ? addDaysISO(startDate, Math.ceil(startDay + durationDays))
    : null;

  function handleSave() {
    const ph = parseHours(durationDraft);
    if (ph === null) { setDurationInvalid(true); return; }
    if (!personId) return;

    const saved: SprintEvent = {
      id: event?.id ?? generateId(),
      type,
      personId,
      startDay,
      durationDays: ph / HOURS_PER_DAY,
      sprintStartDate: event?.sprintStartDate ?? startDate,
    };
    onSave(saved);
    onClose();
  }

  return (
    <Modal
      title={isNew ? 'Новое событие' : 'Редактировать событие'}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 min-w-[340px]">

        {/* Type selector */}
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-2">Тип события</div>
          <div className="flex gap-2">
            {(Object.keys(EVENT_LABELS) as SprintEventType[]).map(t => {
              const colors = EVENT_COLORS[t];
              const isActive = type === t;
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold border-2 transition-all"
                  style={{
                    background: isActive ? colors.bg : '#f8fafc',
                    borderColor: isActive ? colors.border : '#e2e8f0',
                    color: isActive ? colors.text : '#94a3b8',
                  }}
                >
                  {EVENT_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Person */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Участник</label>
          <select
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-400"
            value={personId}
            onChange={e => setPersonId(e.target.value)}
          >
            {people.map(p => (
              <option key={p.id} value={p.id}>{p.name} — {p.role}</option>
            ))}
          </select>
        </div>

        {/* Start date + duration */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
              Дата начала
            </label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
              value={selectedDate}
              min={startDate}
              max={sprintEndDate}
              onChange={e => setSelectedDate(e.target.value || initialDateISO)}
            />
            <p className="mt-1 text-xs text-slate-400">{formatHumanDate(selectedDate)}</p>
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Длительность</label>
            <input
              type="text"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                durationInvalid
                  ? 'border-red-400 focus:ring-red-400 bg-red-50'
                  : 'border-slate-300 focus:ring-cyan-400'
              }`}
              placeholder="напр. 2д, 4ч, 1д 4ч"
              value={durationDraft}
              onChange={e => { setDurationDraft(e.target.value); setDurationInvalid(false); }}
              onBlur={() => {
                const ph = parseHours(durationDraft);
                if (ph !== null) setDurationDraft(formatHours(ph));
              }}
            />
          </div>
        </div>

        {/* Preview */}
        {durationDays !== null && (
          <div
            className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
            style={{
              background: EVENT_COLORS[type].bg,
              borderLeft: `3px solid ${EVENT_COLORS[type].border}`,
              color: EVENT_COLORS[type].text,
            }}
          >
            <span className="font-semibold">{EVENT_LABELS[type]}</span>
            <span className="opacity-70">·</span>
            <span>{formatDuration(durationDays)}</span>
            {endDateISO && (
              <>
                <span className="opacity-70">·</span>
                <span>{formatHumanDate(selectedDate)} — {formatHumanDate(endDateISO)}</span>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {!isNew && onDelete && (
            <button
              onClick={() => { onDelete(event!.id); onClose(); }}
              className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Удалить
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={!personId || parseHours(durationDraft) === null}
            className="px-4 py-2 text-xs font-semibold bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isNew ? 'Создать' : 'Сохранить'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
