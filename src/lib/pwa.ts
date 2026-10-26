/**
 * PWA-/Plattform-Erkennung — reine Helfer, kein State, kein Hook.
 *
 * Wird von den IntroSlides genutzt, um die Installationsanleitung auf die
 * tatsächliche Plattform zuzuschneiden und sie in der bereits installierten
 * App wegzulassen. Keine Fachlogik (Regel 3/4): nur Browser-Abfragen.
 */

/**
 * True, wenn die App als installierte PWA läuft.
 *
 * `display-mode: standalone` deckt Android und Desktop ab, `navigator.standalone`
 * iOS-Safari — iOS kennt die Media Query nicht. `matchMedia` ist optional
 * verkettet, weil es in exotischen WebViews fehlen kann.
 */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export type Platform = 'ios' | 'android' | 'desktop';

/**
 * Grobe Plattform-Erkennung für den passenden Installations-Wortlaut.
 *
 * iPadOS 13+ meldet sich im User-Agent als „MacIntel" und wäre sonst Desktop;
 * `maxTouchPoints > 1` entlarvt es als iOS. Bewusst grob — es geht nur darum,
 * welchen Weg wir beschreiben, nicht um Feature-Detection.
 */
export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}
