/* ============ RegWatch prototype data - compiled from Wavestone NIS 2 watch documentation (WATCH decks, WID 2026, KPI Excel), last updates June-July 2026 ============ */
const REGULATIONS = [
  { id: "nis2", name: "NIS 2", full: "Directive (EU) 2022/2555 - transposition deadline 17 Oct 2024", active: true },
  { id: "dora", name: "DORA", full: "Regulation (EU) 2022/2554 - planned module", active: false },
  { id: "cer",  name: "CER",  full: "Directive (EU) 2022/2557 - planned module", active: false },
  { id: "cra",  name: "CRA",  full: "Cyber Resilience Act - planned module", active: false }
];
const LEVELS = {
  1: { label: "Preliminary transposition work underway" },
  2: { label: "Bill currently before the legislature" },
  3: { label: "Law approved - framework provisional or unavailable" },
  4: { label: "Law approved - final cybersecurity framework available" }
};
const FW_LABEL = { final: "Final framework", temporary: "Temporary framework", none: "No framework yet" };
const GLOBAL_SOURCES = [
  { name: "EUR-Lex", url: "https://eur-lex.europa.eu", type: "official", scope: "EU", note: "Directive texts, implementing regulations, infringement decisions" },
  { name: "European Commission - Digital Strategy", url: "https://digital-strategy.ec.europa.eu", type: "official", scope: "EU", note: "Transposition tracking, reasoned opinions, CJEU referrals" },
  { name: "ENISA", url: "https://www.enisa.europa.eu", type: "official", scope: "EU", note: "Registry of digital entities, technical guidance" },
  { name: "Specialised press (national & EU cyber media)", url: "", type: "unofficial", scope: "All", note: "Monitored - every item must be verified against an official source before publication" },
  { name: "LinkedIn / practitioner community", url: "", type: "unofficial", scope: "All", note: "Monitored - verification mandatory before publication" },
  { name: "Sector working groups & peer exchanges", url: "", type: "manual", scope: "All", note: "Manual input by Wavestone consultants; may contain not-yet-public information - flag as internal" }
];
