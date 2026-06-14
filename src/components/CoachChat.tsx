/**
 * CoachChat — persistenter Dialog mit dem Coach (Block 3).
 *
 * UI-only (Regel 3): rendert den Verlauf und löst Actions aus
 * (sendChatMessage/confirm/reject). Keine Trainingsentscheidung hier — Marker
 * werden nie automatisch angewendet, sondern erst nach Nutzer-Bestätigung.
 * Wird im PlanScreen eingebettet (kein eigener Screen).
 */

import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/state';
import { describeMarker } from '../lib/services/chatService';
import type { ChatMessage } from '../shared/types';
import '../screens/screens.css';

type SwapScope = 'this_week' | 'permanent';

interface BubbleProps {
  msg: ChatMessage;
  onConfirm: (id: string, scope?: SwapScope) => void;
  onReject: (id: string) => void;
}

function Bubble({ msg, onConfirm, onReject }: BubbleProps) {
  const isCoach = msg.role === 'coach';
  const hasMarkers = !!msg.proposedMarkers && msg.proposedMarkers.length > 0;
  // EXERCISE_SWAP braucht eine Scope-Wahl (nur diese Woche / dauerhaft).
  const isSwap = !!msg.proposedMarkers?.some((m) => m.kind === 'EXERCISE_SWAP');
  return (
    <div className={`ps-chat-row ${isCoach ? 'is-coach' : 'is-user'}`}>
      <div className={`ps-chat-bubble ${isCoach ? 'is-coach' : 'is-user'}`}>
        <div className="ps-chat-text">{msg.content}</div>

        {isCoach && hasMarkers && msg.status === 'pending_confirm' && (
          <div className="ps-chat-actions">
            {isSwap ? (
              <>
                <button
                  type="button"
                  className="ps-chat-confirm"
                  onClick={() => onConfirm(msg.id, 'this_week')}
                >
                  Nur diese Woche
                </button>
                <button
                  type="button"
                  className="ps-chat-confirm"
                  onClick={() => onConfirm(msg.id, 'permanent')}
                >
                  Dauerhaft
                </button>
              </>
            ) : (
              <button type="button" className="ps-chat-confirm" onClick={() => onConfirm(msg.id)}>
                Übernehmen
              </button>
            )}
            <button type="button" className="ps-chat-reject" onClick={() => onReject(msg.id)}>
              Verwerfen
            </button>
          </div>
        )}
        {isCoach && hasMarkers && msg.status === 'confirmed' && (
          <div className="ps-chat-note is-confirmed">
            Übernommen — {(msg.proposedMarkers ?? []).map(describeMarker).join('; ')}
          </div>
        )}
        {isCoach && hasMarkers && msg.status === 'rejected' && (
          <div className="ps-chat-note is-rejected">Verworfen</div>
        )}
      </div>
    </div>
  );
}

export function CoachChat() {
  const {
    chatMessages,
    chatLoading,
    chatError,
    sendChatMessage,
    confirmChatMarker,
    rejectChatMarker,
    activeWorkout,
  } = useApp();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Plan-Anpassung während eines laufenden Workouts: nachfragen (WICHTIG).
  const guardedConfirm = (id: string, scope?: 'this_week' | 'permanent') => {
    if (
      activeWorkout &&
      !window.confirm(
        'Du hast ein laufendes Workout. Plan-Anpassung jetzt übernehmen? ' +
          '(Abbrechen = später nach dem Workout bestätigen.)',
      )
    ) {
      return;
    }
    confirmChatMarker(id, scope);
  };

  // Bei neuer Nachricht / Tippanzeige ans Ende scrollen.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chatMessages.length, chatLoading]);

  const onSend = () => {
    const text = input.trim();
    if (!text || chatLoading) return;
    setInput('');
    void sendChatMessage(text);
  };

  return (
    <div className="ps-chat">
      <div className="ps-chat-log">
        {chatMessages.length === 0 ? (
          <div className="ps-chat-empty">Schreib dem Coach. Tagesform, Frage, Feedback.</div>
        ) : (
          chatMessages.map((m) => (
            <Bubble key={m.id} msg={m} onConfirm={guardedConfirm} onReject={rejectChatMarker} />
          ))
        )}
        {chatLoading && (
          <div className="ps-chat-row is-coach">
            <div className="ps-chat-bubble is-coach ps-chat-typing" aria-label="Coach schreibt">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {chatError && <div className="ps-chat-error">{chatError}</div>}

      <div className="ps-chat-input">
        <textarea
          className="ps-chat-textarea"
          placeholder="Nachricht an den Coach …"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button
          type="button"
          className="ps-btn ps-btn-primary ps-chat-send"
          disabled={!input.trim() || chatLoading}
          onClick={onSend}
        >
          Senden
        </button>
      </div>
    </div>
  );
}
