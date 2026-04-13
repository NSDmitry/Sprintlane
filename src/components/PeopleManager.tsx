import { useState } from 'react';
import type { Person } from '../types';
import { Modal } from './Modal';

interface Props {
  people: Person[];
  onAddPerson: (name: string, role: string) => void;
  onUpdatePerson: (person: Person) => void;
  onDeletePerson: (id: string) => void;
  onClose: () => void;
}

const ROLES = ['Разработчик', 'Тестировщик'];

function PersonRow({
  person,
  onUpdate,
  onDelete,
}: {
  person: Person;
  onUpdate: (p: Person) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState(person.role);

  const save = () => {
    if (!name.trim()) return;
    onUpdate({ ...person, name: name.trim(), role: role.trim() });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2 border-b border-slate-100">
        <div
          className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
          style={{ background: person.color }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <input
          autoFocus
          className="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        />
        <select
          className="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white"
          value={role}
          onChange={e => setRole(e.target.value)}
        >
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={save} className="text-xs text-cyan-600 hover:text-cyan-800 font-semibold px-2">Ок</button>
        <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600">Отмена</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-2 border-b border-slate-100 group">
      <div
        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
        style={{ background: person.color }}
      >
        {person.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">{person.name}</div>
        <div className="text-xs text-slate-400 truncate">{person.role}</div>
      </div>
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 text-xs text-slate-400 hover:text-cyan-600 transition-all px-1"
      >
        Изменить
      </button>
      <button
        onClick={() => onDelete(person.id)}
        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all font-bold text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}

export function PeopleManager({ people, onAddPerson, onUpdatePerson, onDeletePerson, onClose }: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState(ROLES[0]);

  const handleAdd = () => {
    if (!name.trim()) return;
    onAddPerson(name.trim(), role);
    setName('');
    setRole(ROLES[0]);
  };

  return (
    <Modal title="Участники" onClose={onClose}>
      {/* Add form */}
      <div className="flex gap-2 mb-4">
        <input
          autoFocus
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
          placeholder="Имя"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <select
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white"
          value={role}
          onChange={e => setRole(e.target.value)}
        >
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button
          onClick={handleAdd}
          disabled={!name.trim()}
          className="px-4 py-2 text-sm bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-40 font-medium transition-colors"
        >
          Добавить
        </button>
      </div>

      {/* List */}
      {people.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">Нет участников</div>
      ) : (
        <div>
          {people.map(p => (
            <PersonRow key={p.id} person={p} onUpdate={onUpdatePerson} onDelete={onDeletePerson} />
          ))}
        </div>
      )}
    </Modal>
  );
}
