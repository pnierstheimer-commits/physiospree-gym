/**
 * WeekDayPlanner — Wochentags-Zuordnung der Sessions per Drag-and-Drop.
 *
 * UI-only (Regel 3): verschiebt die `scheduledDay`-Zuordnung und meldet die neue
 * Session-Liste über onReorder zurück (Persistenz/Logik liegen im State/Service).
 *
 * Layout: sieben Drop-Zonen Mo–So als vertikale Liste (mobile-first, Regel 10 —
 * sieben lesbare Spalten passen nicht auf ein Handy; jeder Tag bleibt eine
 * eigene Drop-Zone). Touch-Support via PointerSensor mit Aktivierungs-Delay,
 * damit ein kurzer Tipp ein Klick (Detail öffnen) und ein Halten ein Drag ist.
 */

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { WEEKDAYS, WEEKDAY_LABELS } from '../shared/constants';
import type { PlannedSession, PlanWeek, WeekDay } from '../shared/types';
import '../screens/screens.css';

const DAY_PREFIX = 'day:';

interface CardContentProps {
  session: PlannedSession;
}
function CardContent({ session }: CardContentProps) {
  return (
    <>
      <span className="ps-dp-card-name">{session.name}</span>
      <span className="ps-dp-card-count">{session.exercises.length} Übungen</span>
    </>
  );
}

interface SessionCardProps {
  session: PlannedSession;
  selected: boolean;
  onSelect: (s: PlannedSession) => void;
}
function SessionCard({ session, selected, onSelect }: SessionCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: session.id });
  return (
    <div
      ref={setNodeRef}
      className={`ps-dp-card${selected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}`}
      onClick={() => onSelect(session)}
      {...listeners}
      {...attributes}
    >
      <CardContent session={session} />
    </div>
  );
}

interface DayRowProps {
  day: WeekDay;
  sessions: PlannedSession[];
  selectedId: string | null;
  onSelect: (s: PlannedSession) => void;
  date: string | null;
  today: boolean;
}
function DayRow({ day, sessions, selectedId, onSelect, date, today }: DayRowProps) {
  const { setNodeRef, isOver } = useDroppable({ id: DAY_PREFIX + day });
  return (
    <div className={`ps-dp-day${today ? ' is-today' : ''}`}>
      <span className="ps-dp-day-label">
        {WEEKDAY_LABELS[day]}
        {date && <span className="ps-dp-day-date">{date}</span>}
        {today && <span className="ps-dp-day-today">Heute</span>}
      </span>
      <div ref={setNodeRef} className={`ps-dp-day-slot${isOver ? ' is-over' : ''}`}>
        {sessions.length === 0 ? (
          <span className="ps-dp-empty" aria-hidden="true">
            —
          </span>
        ) : (
          sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              selected={s.id === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface WeekDayPlannerProps {
  week: PlanWeek;
  onReorder: (sessions: PlannedSession[]) => void;
  selectedSessionId?: string | null;
  onSelectSession?: (s: PlannedSession) => void;
  /** Optionales absolutes Datum je Wochentag ("16.6."). null = kein Datum. */
  dateForDay?: (day: WeekDay) => string | null;
  /** Ist dieser Wochentag heute? Hebt den Tag hervor. */
  isToday?: (day: WeekDay) => boolean;
}

export function WeekDayPlanner({
  week,
  onReorder,
  selectedSessionId = null,
  onSelectSession,
  dateForDay,
  isToday,
}: WeekDayPlannerProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const sessions = week.sessions;
  const byDay = (day: WeekDay) =>
    sessions.filter((s) => s.scheduledDay === day).sort((a, b) => a.dayIndex - b.dayIndex);
  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith(DAY_PREFIX)) return;
    const targetDay = overId.slice(DAY_PREFIX.length) as WeekDay;
    const moved = sessions.find((s) => s.id === String(active.id));
    if (!moved) return;
    const fromDay = moved.scheduledDay ?? null;
    if (fromDay === targetDay) return;

    // Tausch: Sessions, die schon auf targetDay liegen, wandern auf den
    // vorherigen Tag der gezogenen Session (fromDay).
    const next = sessions.map((s) => {
      if (s.id === moved.id) return { ...s, scheduledDay: targetDay };
      if (s.scheduledDay === targetDay && fromDay) return { ...s, scheduledDay: fromDay };
      return s;
    });
    onReorder(next);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="ps-dayplanner">
        {WEEKDAYS.map((day) => (
          <DayRow
            key={day}
            day={day}
            sessions={byDay(day)}
            selectedId={selectedSessionId}
            onSelect={(s) => onSelectSession?.(s)}
            date={dateForDay ? dateForDay(day) : null}
            today={isToday ? isToday(day) : false}
          />
        ))}
      </div>
      <DragOverlay>
        {activeSession ? (
          <div className="ps-dp-card is-overlay">
            <CardContent session={activeSession} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
