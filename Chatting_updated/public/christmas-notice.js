/**
 * christmas-notice.js — one-time "Christmas update" popup for ptr_29 Chat.
 *
 * Loads AFTER client.js so it can reuse the site's modal styling and showToast.
 * Shows exactly once per device per season, then never again: the dismissal is
 * remembered in localStorage under a year-scoped key, so next December it comes
 * back with the theme.
 *
 * Season gating mirrors christmas.js: December only, every year. Keep
 * SEASON_MONTH / SEASON_YEAR in step with that file.
 *
 * TESTING: while CHRISTMAS_TEST_MODE is true the notice can be previewed out of
 * season with `?christmas=1` (and suppressed with `?christmas=0`). Set it back
 * to false to make the popup strictly December-only again.
 */
(function () {
  'use strict';

  var SEASON_MONTH = 11;    // December (zero-based)
  var SEASON_YEAR = null;   // null = every December; set a year to pin it
  var TEST_MODE_KEY = 'ptr29_christmas_test_v1';
  var SEEN_KEY = 'ptr29_christmas_notice_v1';   // suffixed with the season year
  var DELAY_MS = 1400;      // let the room list settle before interrupting

  // ── test mode (mirror of christmas.js) ───────────────────────────────────
  var CHRISTMAS_TEST_MODE = true;
  var forced = null;
  try {
    var qp = new URLSearchParams(window.location.search);
    if (qp.get('christmas') === '1') { forced = true; localStorage.setItem(TEST_MODE_KEY, '1'); }
    else if (qp.get('christmas') === '0') { forced = false; localStorage.setItem(TEST_MODE_KEY, '0'); }
    else if (localStorage.getItem(TEST_MODE_KEY) === '1') forced = true;
  } catch (e) {}

  var today = new Date();
  var inSeason = today.getMonth() === SEASON_MONTH &&
    (SEASON_YEAR === null || today.getFullYear() === SEASON_YEAR);
  if (CHRISTMAS_TEST_MODE && forced === true) inSeason = true;
  if (!inSeason) return;

  var key = SEEN_KEY + ':' + today.getFullYear();
  // A forced test preview ignores the "already seen" flag so it always shows.
  if (!(CHRISTMAS_TEST_MODE && forced === true)) {
    try { if (localStorage.getItem(key) === '1') return; } catch (e) {}
  }

  // Don't interrupt the signup gate / age gate: those own the screen first and
  // are dismissed later in the session. Wait until no gate is showing.
  function gateOpen() {
    if (document.getElementById('ag-overlay')) return true;
    if (document.getElementById('ag-age-overlay')) return true;
    if (document.getElementById('ag-terms-overlay')) return true;
    var open = document.querySelector('.modal-overlay.open');
    return !!open;
  }

  function build() {
    var overlay = document.createElement('div');
    overlay.id = 'xmas-notice';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'xmas-notice-title');

    overlay.innerHTML =
      '<div class="modal xmas-notice-card">' +
        '<div class="xmas-notice-glow" aria-hidden="true"></div>' +
        '<button class="help-close" id="xmas-notice-close" type="button" aria-label="Close">×</button>' +
        '<div class="xmas-notice-emoji" aria-hidden="true">🎄</div>' +
        '<h3 id="xmas-notice-title">Merry Christmas! 🎄</h3>' +
        '<p>ptr_29 Chat has gone <strong>merry and bright</strong> — a brand-new ' +
          '<strong>3D live-motion</strong> Christmas theme and backdrop, here for December only.</p>' +
        '<ul class="xmas-notice-list">' +
          '<li>❄️ <strong>Live 3D scene</strong> behind the chat — falling snow, aurora ribbons and a snowy village that follows your cursor</li>' +
          '<li>🛷 <strong>Sleighs, fairy lights &amp; a lit tree</strong> drifting over the winter hills</li>' +
          '<li>🎄 <strong>Tap the 🎄 in the header</strong> any time to switch it off (it comes back next December unless you turn it off again)</li>' +
          '<li>⏸ <strong>Keep it calm</strong> — the existing motion toggle still freezes every animation</li>' +
        '</ul>' +
        '<div class="xmas-notice-actions">' +
          '<button id="xmas-notice-ok" type="button">🎄 Enjoy the season</button>' +
        '</div>' +
      '<p class="xmas-notice-foot">Made for the community — thank you for chatting here. ❄️</p>' +
      '</div>';

    document.body.appendChild(overlay);
    return overlay;
  }

  function open() {
    var overlay = build();
    var dismissed = false;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      try { localStorage.setItem(key, '1'); } catch (e) {}
      overlay.classList.remove('open');
      setTimeout(function () { overlay.remove(); }, 260);
    }

    overlay.querySelector('#xmas-notice-close').addEventListener('click', dismiss);
    overlay.querySelector('#xmas-notice-ok').addEventListener('click', dismiss);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') dismiss();
    });

    // Next frame so the .open transition actually runs.
    requestAnimationFrame(function () { if (overlay) overlay.classList.add('open'); });
  }

  // Poll for a clear screen rather than guessing a fixed delay: the age gate,
  // account gate and terms modal can all appear after this script runs.
  var waited = 0;
  var timer = setInterval(function () {
    waited += 500;
    if (!gateOpen() && document.body) {
      clearInterval(timer);
      setTimeout(open, DELAY_MS);
    } else if (waited > 120000) {
      clearInterval(timer);   // gave up after two minutes of gates; skip quietly
    }
  }, 500);
})();
