/* ================= Boot =================
 *
 * This is a separate file for one reason: it must run last.
 *
 * The bundle is a concatenation, so `const` and `let` at the top level of a
 * later file are in the temporal dead zone while an earlier file executes.
 * While booting lived at the end of app_part2.js, loading the page directly on
 * #/insights - which is what a reload on the Assistant tab does - called into
 * app_chat.js before its constants existed:
 *
 *     Uncaught ReferenceError: Cannot access 'CHAT_DEFAULT_MODE'
 *     before initialization
 *
 * and the whole boot died there, leaving the static chrome and a blank view.
 * Nothing here may be moved back into a file that another one follows.
 */
"use strict";

/* The active regulation decides which records exist and which tabs are
   reachable, so it is applied before anything renders. */
regApply();
regRenderPills();
regSyncTabs();
regFooter();
refreshBadge();

const r0 = parseHash();
route(regHasTab(r0.v) || r0.v === "country" ? r0.v : "overview", r0.arg);
