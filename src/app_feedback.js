/* ---------- vos retours sur l'outil ----------
 *
 * Le site n'a pas de serveur : il ne peut pas envoyer un courriel lui-meme sans
 * un service tiers, qui verrait passer les retours et ferait entrer une cle dans
 * une page publique. On passe donc par la messagerie de l'utilisateur : le
 * bouton ouvre un courriel deja adresse et rempli (lien mailto), qu'il n'a plus
 * qu'a envoyer. Rien ne part sans son clic, et le retour arrive depuis sa propre
 * adresse, ce qui permet de lui repondre.
 *
 * Le contexte (page, version, langue) est ajoute au message : c'est ce qu'on
 * demande toujours en premier devant un « ca ne marche pas ».
 */
const FEEDBACK_TO = "";   /* adresse de reception - a renseigner */

function feedbackContext(){
  const r = typeof currentRoute !== "undefined" ? currentRoute : { v: "overview" };
  const page = r.v === "country" && r.arg && byIso[r.arg] ? t("nav.countries") + " › " + byIso[r.arg].name
    : (typeof assistContext === "function" ? assistContext().label : r.v);
  const team = typeof renderDev === "function";
  return { page, version: team ? t("fb.team") : t("fb.client"), lang: lang.toUpperCase(),
           date: new Date().toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB") };
}

function feedbackOpen(){
  let dlg = document.getElementById("fbDlg");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "fbDlg";
    document.body.appendChild(dlg);
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  }
  const ctx = feedbackContext();
  const kinds = [["idea", t("fb.k.idea")], ["bug", t("fb.k.bug")], ["other", t("fb.k.other")]];
  dlg.innerHTML = `<form class="fb" method="dialog">
    <div class="fb-h"><h2>${t("fb.title")}</h2>
      <button class="x" type="button" id="fbClose" aria-label="${t("fiche.close")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button></div>
    <div class="fb-b">
      <p class="fb-intro">${t("fb.intro")}</p>
      <div class="fb-kinds" role="radiogroup" aria-label="${esc(t("fb.kind"))}">${kinds.map(([k, l], i) =>
        `<label><input type="radio" name="fbKind" value="${k}" ${i ? "" : "checked"}><span>${l}</span></label>`).join("")}</div>
      <label class="fb-f"><span>${t("fb.msg")}</span>
        <textarea id="fbMsg" rows="6" placeholder="${esc(t("fb.msgPh"))}"></textarea></label>
      <label class="fb-f"><span>${t("fb.name")}</span>
        <input id="fbName" type="text" autocomplete="name" placeholder="${esc(t("fb.namePh"))}"></label>
      <p class="fb-ctx">${t("fb.ctx")} <b>${esc(ctx.page)}</b> · ${esc(ctx.version)} · ${ctx.lang}</p>
      <p class="fb-msg" id="fbStatus" role="status"></p>
    </div>
    <div class="fb-f2">
      <button type="button" class="btn" id="fbCopy">${t("fb.copy")}</button>
      <button type="button" class="btn primary" id="fbSend" ${FEEDBACK_TO ? "" : "disabled"}>${t("fb.send")}</button>
    </div>
    <p class="fb-note">${FEEDBACK_TO ? t("fb.note") : t("fb.noAddress")}</p>
  </form>`;

  const text = () => {
    const kind = (dlg.querySelector("input[name=fbKind]:checked") || {}).value || "other";
    const label = (kinds.find(k => k[0] === kind) || kinds[2])[1];
    const name = $("#fbName", dlg).value.trim();
    return {
      subject: "[RegWatch] " + label + " - " + ctx.page,
      body: $("#fbMsg", dlg).value.trim() + "\n\n---\n"
        + (name ? t("fb.from") + " : " + name + "\n" : "")
        + t("fb.ctx") + " " + ctx.page + " · " + ctx.version + " · " + ctx.lang + " · " + ctx.date
    };
  };
  const status = s => { $("#fbStatus", dlg).textContent = s; };
  const empty = () => {
    if ($("#fbMsg", dlg).value.trim()) return false;
    status(t("fb.empty"));
    $("#fbMsg", dlg).focus();
    return true;
  };

  $("#fbClose", dlg).addEventListener("click", () => dlg.close());
  $("#fbSend", dlg).addEventListener("click", () => {
    if (empty()) return;
    const m = text();
    location.href = "mailto:" + FEEDBACK_TO + "?subject=" + encodeURIComponent(m.subject)
      + "&body=" + encodeURIComponent(m.body);
    status(t("fb.opened"));
  });
  $("#fbCopy", dlg).addEventListener("click", async () => {
    if (empty()) return;
    const m = text();
    try {
      await navigator.clipboard.writeText(m.subject + "\n\n" + m.body);
      status(t("fb.copied"));
    } catch (e) {
      status(t("fb.copyFail"));
    }
  });
  dlg.showModal();
  $("#fbMsg", dlg).focus();
}

function feedbackWire(){
  const b = document.getElementById("fbOpen");
  if (b) b.addEventListener("click", feedbackOpen);
}
feedbackWire();
