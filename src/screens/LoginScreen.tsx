/**
 * LoginScreen — harter Login-Gate über OTP-Code (Phase 4).
 *
 * Zwei Schritte: (A) E-Mail -> Code senden, (B) Code -> Anmelden. Bei Erfolg
 * entsteht die Session (Supabase), App.tsx routet automatisch weiter. Kein
 * "ohne Konto"-Ausweg — Login ist Pflicht. UI-only: sendOtp/verifyOtp kommen
 * als Props aus dem useAuth-Hook im App-Root (keine doppelte Auth-Instanz).
 */

import { useState } from 'react';
import './screens.css';

interface LoginScreenProps {
  sendOtp: (email: string) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen({ sendOtp, verifyOtp }: LoginScreenProps) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());

  const onSend = async () => {
    if (!emailValid || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await sendOtp(email.trim());
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setCode('');
    setStep('code');
  };

  const onVerify = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await verifyOtp(email.trim(), code);
    setBusy(false);
    // Bei Erfolg: Session kommt rein, App.tsx wechselt den Screen.
    if (err) setError('Code ungültig oder abgelaufen. Bitte prüfen.');
  };

  const onChangeEmail = () => {
    setStep('email');
    setCode('');
    setError(null);
  };

  return (
    <div className="ps-screen">
      <div className="ps-shell ps-login">
        <div className="ps-login-head">
          <div className="ps-brand">Physiospree</div>
          <div className="ps-login-tag">KI-Kraftcoach fürs Studio</div>
        </div>

        {step === 'email' ? (
          <form
            className="ps-login-form"
            onSubmit={(e) => {
              e.preventDefault();
              void onSend();
            }}
          >
            <div className="ps-title">Anmelden</div>
            <p className="ps-subtitle">Wir schicken dir einen 6-stelligen Code per E-Mail.</p>
            <input
              className="ps-login-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder="deine@email.de"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
            />
            {error && <div className="ps-login-error">{error}</div>}
            <button
              type="submit"
              className="ps-btn ps-btn-primary"
              disabled={!emailValid || busy}
            >
              {busy ? 'Sende …' : 'Code senden'}
            </button>
          </form>
        ) : (
          <form
            className="ps-login-form"
            onSubmit={(e) => {
              e.preventDefault();
              void onVerify();
            }}
          >
            <div className="ps-title">Code eingeben</div>
            <p className="ps-subtitle">
              Code an <strong>{email.trim()}</strong> gesendet.
            </p>
            <input
              className="ps-login-input ps-login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                setError(null);
              }}
            />
            {error && <div className="ps-login-error">{error}</div>}
            <button
              type="submit"
              className="ps-btn ps-btn-primary"
              disabled={code.length !== 6 || busy}
            >
              {busy ? 'Prüfe …' : 'Anmelden'}
            </button>
            <button
              type="button"
              className="ps-btn ps-btn-ghost ps-btn-quiet"
              onClick={onChangeEmail}
            >
              Andere E-Mail
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
