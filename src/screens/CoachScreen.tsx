/**
 * CoachScreen — Coach-Dialog im Vollbild.
 *
 * Header "Coach", darunter der Chat über die volle Höhe (Eingabefeld unten,
 * über der Bottom-Nav). Kein Akkordeon — der Chat IST der Screen.
 */

import { CoachChat } from '../components/CoachChat';
import './screens.css';

export function CoachScreen() {
  return (
    <div className="ps-screen">
      <div className="ps-shell ps-coach-shell">
        <div className="ps-coach-head">Coach</div>
        <CoachChat fullscreen />
      </div>
    </div>
  );
}
