/* ---------- vos retours sur l'outil ----------
 *
 * Les retours passent par un Microsoft Forms du tenant Wavestone : les reponses
 * sont rangees dans un tableau, et son proprietaire est prevenu par courriel a
 * chacune. Le site n'a ainsi ni serveur ni cle a porter.
 *
 * Le formulaire s'affiche dans la fenetre, charge seulement a l'ouverture. Un
 * lien l'ouvre aussi dans un nouvel onglet : quand le formulaire est reserve aux
 * comptes Wavestone, certains navigateurs refusent la connexion Microsoft a
 * l'interieur d'une page tierce (cookies tiers bloques), et la fenetre resterait
 * sur un ecran de connexion.
 */
const FEEDBACK_FORM = "https://forms.cloud.microsoft/e/jQvtSwVTpK";
const FEEDBACK_EMBED = "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id="
  + "lmzpXXzIzk2q2fXFV7Uqwa9tl5VL_81BvSrkWj_JKMBUNkNYMElHWjJTWTVRNE9IRTlTMkVLMDhOVi4u&embed=true";

function feedbackOpen(){
  let dlg = document.getElementById("fbDlg");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "fbDlg";
    document.body.appendChild(dlg);
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  }
  dlg.innerHTML = `<div class="fb">
    <div class="fb-h"><h2>${t("fb.title")}</h2>
      <a class="btn fb-tab" href="${FEEDBACK_FORM}" target="_blank" rel="noopener">${t("fb.newTab")}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></a>
      <button class="x" type="button" id="fbClose" aria-label="${t("fiche.close")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button></div>
    <div class="fb-frame">
      <iframe src="${FEEDBACK_EMBED}" title="${esc(t("fb.title"))}" allowfullscreen></iframe></div>
    <p class="fb-note">${t("fb.help")}</p>
  </div>`;
  $("#fbClose", dlg).addEventListener("click", () => dlg.close());
  dlg.showModal();
}

function feedbackWire(){
  const b = document.getElementById("fbOpen");
  if (b) b.addEventListener("click", feedbackOpen);
}
feedbackWire();
