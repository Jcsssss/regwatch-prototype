#!/usr/bin/env python3
"""Theme vocabulary in the languages the sources are actually written in.

The cell router matched French and English only. That was invisible for as long
as it read the agent's summary - the agent writes French whatever the source
language, so it was doing translation work without anyone noticing. The moment
the router started reading article bodies, the gap opened: a Czech NÚKIB page
never contains the word "sanction", and a German BSI page never contains
"référentiel".

Measured on sixteen live pages before this existed: routing on the body alone
lost 22 themes it should have kept, and the language mismatch was one of the two
causes.

Coverage is deliberately shallow and wide rather than exhaustive: two to five
unmistakable words per theme per language. A router wants recall - a theme
raised wrongly is dismissed by the validator in a second, a theme never raised
is invisible - and a long tail of near-synonyms buys little while inviting false
matches on unrelated pages.

Languages: the twenty-four the authority registry actually publishes in, plus
Norwegian. Greek and Bulgarian are written in their own scripts, which makes
them safer to match than the Latin ones, not riskier.

Used by tools/veille_to_watchitems.py, which composes the final patterns.
"""

# One entry per workbook sheet the router can target. Terms are matched
# case-insensitively; accented forms are written as they appear in the source.
THEME_TERMS = {
    "Registration": [
        # de, nl, cs/sk, es/pt, it, pl, sv/da/no, fi, hu, ro, el, hr/sl, bg, et, lv, lt
        "registrierung", "anmeldung", "meldepflicht",
        "registratie", "aanmelding",
        "registrace", "registrácia", "evidence subjektů",
        "registro", "inscripción", "inscrição",
        "registrazione",
        "rejestracja", "zgłoszenie podmiotu",
        "registrering", "registreringen",
        "rekisteröinti", "ilmoittautuminen",
        "regisztráció", "nyilvántartás",
        "înregistrare",
        "εγγραφή", "καταχώριση",
        "registracija",
        "регистрация",
        "registreerimine",
        "reģistrācija",
    ],
    "Incident reporting": [
        "meldung", "sicherheitsvorfall", "vorfall", "meldepflichten",
        "melding", "incidentmelding",
        "hlášení incidentu", "incident", "hlásenie",
        "notificación", "incidente", "notificação",
        "notifica", "segnalazione",
        "zgłaszanie incydentów", "incydent",
        "rapportering", "hændelse", "hendelse", "incidentrapportering",
        "ilmoitus", "poikkeama", "häiriö",
        "bejelentés", "biztonsági esemény",
        "raportare", "incident de securitate",
        "αναφορά", "περιστατικό",
        "prijava incidenta", "incidenta",
        "докладване", "инцидент",
        "teavitamine", "intsident",
        "ziņošana", "incidents",
        "pranešimas", "incidentas",
    ],
    "Sanctions": [
        "bußgeld", "geldbuße", "sanktion", "zwangsgeld",
        "boete", "sanctie", "dwangsom",
        "pokuta", "sankce", "sankcia",
        "sanción", "multa", "sanção", "coima",
        "sanzione", "ammenda",
        "kara pieniężna", "sankcja", "grzywna",
        "bøde", "böter", "sanktioner",
        "sakko", "seuraamusmaksu",
        "bírság", "szankció",
        "sancțiune", "amendă",
        "κύρωση", "πρόστιμο",
        "kazna", "sankcija", "novčana",
        "санкция", "глоба",
        "trahv", "sanktsioon",
        "sods", "naudas sods",
        "bauda",
    ],
    "Audit & Controls": [
        "prüfung", "überprüfung", "kontrolle", "nachweis", "zertifizierung",
        "controle", "toezicht", "audit",
        "kontrola", "dohled", "dohľad", "certifikace",
        "auditoría", "inspección", "supervisión",
        "verifica", "ispezione", "vigilanza",
        "audyt", "nadzór",
        "revision", "tilsyn", "granskning",
        "auditointi", "valvonta",
        "ellenőrzés", "felügyelet",
        "control", "supraveghere",
        "έλεγχος", "εποπτεία",
        "revizija", "nadzor",
        "одит", "контрол", "надзор",
        "järelevalve", "auditeerimine",
        "uzraudzība", "audits",
        "priežiūra", "auditas",
    ],
    "Cybersecurity frameworks": [
        "rahmenwerk", "anforderungen", "sicherheitsmaßnahmen", "mindeststandard",
        "kader", "eisen", "maatregelen", "norm",
        "rámec", "požadavky", "požiadavky", "opatření", "opatrenia",
        "marco", "requisitos", "medidas de seguridad",
        "quadro", "requisiti", "misure di sicurezza",
        "ramy", "wymagania", "środki bezpieczeństwa",
        "ramverk", "rammeværk", "krav", "säkerhetsåtgärder",
        "viitekehys", "vaatimukset", "turvatoimet",
        "keretrendszer", "követelmények", "intézkedések",
        "cadru", "cerințe", "măsuri de securitate",
        "πλαίσιο", "απαιτήσεις", "μέτρα ασφάλειας",
        "okvir", "zahtjevi", "zahteve", "mjere", "ukrepi",
        "рамка", "изисквания", "мерки",
        "raamistik", "nõuded", "meetmed",
        "ietvars", "prasības", "pasākumi",
        "sistema", "reikalavimai", "priemonės",
    ],
    "Authority": [
        "behörde", "bundesamt", "agentur", "anlaufstelle", "zuständige stelle",
        "autoriteit", "bevoegde instantie",
        "úřad", "úrad", "orgán", "příslušný orgán",
        "autoridad", "agencia", "autoridade",
        "autorità", "agenzia",
        "organ właściwy", "urząd",
        "myndighed", "myndighet", "tilsynsmyndighet",
        "viranomainen",
        "hatóság",
        "autoritate", "autoritatea competentă",
        "αρχή", "αρμόδια αρχή",
        "nadležno tijelo", "pristojni organ",
        "орган", "компетентен орган",
        "asutus", "amet", "pädev asutus",
        "iestāde", "kompetentā iestāde",
        "institucija", "tarnyba",
    ],
    "ID": [
        "gesetz", "verordnung", "umsetzung", "inkrafttreten", "bundesgesetzblatt",
        "wet", "besluit", "omzetting", "inwerkingtreding", "staatsblad",
        "zákon", "vyhláška", "transpozice", "transpozícia", "účinnost", "účinnosť",
        "ley", "decreto", "transposición", "entrada en vigor", "boletín oficial",
        "legge", "decreto legislativo", "recepimento", "gazzetta ufficiale",
        "lei", "transposição", "diário da república",
        "ustawa", "rozporządzenie", "transpozycja", "dziennik ustaw",
        "lov", "bekendtgørelse", "gennemførelse", "lag", "förordning", "genomförande",
        "laki", "asetus", "täytäntöönpano", "voimaan",
        "törvény", "rendelet", "átültetés", "hatályba",
        "lege", "ordonanță", "transpunere", "monitorul oficial",
        "νόμος", "διάταγμα", "μεταφορά", "εφημερίδα της κυβερνήσεως",
        "zakon", "uredba", "prenošenje", "prenos direktive", "narodne novine",
        "закон", "наредба", "транспониране", "държавен вестник",
        "seadus", "määrus", "ülevõtmine", "jõustumine",
        "likums", "noteikumi", "transponēšana", "spēkā",
        "įstatymas", "nutarimas", "perkėlimas", "įsigalioja",
    ],
}


def terms_for(sheet_name):
    """Terms for a sheet, whose workbook name carries a ' - P1' style suffix."""
    return THEME_TERMS.get(sheet_name.split(" - ")[0].strip(), [])


def stats():
    return {theme: len(words) for theme, words in THEME_TERMS.items()}


if __name__ == "__main__":
    total = 0
    for theme, words in THEME_TERMS.items():
        total += len(words)
        print("  %-26s %3d termes" % (theme, len(words)))
    print("\n  %d termes au total, %d thèmes" % (total, len(THEME_TERMS)))
