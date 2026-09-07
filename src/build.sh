#!/bin/zsh
# Ce script a besoin de zsh : les listes de fichiers ci-dessous sont des
# tableaux, et bash ne les eclate pas - `cat $APP` n'y prend que le premier
# fichier. Lance sous bash, le build produisait un bundle ampute de 90 % de
# l'application, et `node --check` le validait sans rien dire. On se relance
# donc sous zsh plutot que de faire confiance a l'appelant.
[ -n "$ZSH_VERSION" ] || exec zsh "$0" "$@"
# Build RegWatch from source parts, en deux versions.
#
#   client  regwatch.html, index.html - ce qui est publie et ce qui circule.
#           Pas de role Developpeur : ni documentation embarquee, ni code
#           source, ni onglets techniques. C'est la version que voit le client.
#   equipe  regwatch-equipe.html - la meme, plus le role Developpeur, son
#           diagnostic et son assistant technique qui lit le code. Interne.
#
# La difference est de 372 Ko. La raison de separer n'est pas la taille : le
# client n'a rien a faire d'un role qui parle de la maintenance de l'outil, et
# une page publique n'a pas a proposer un onglet qui n'a de sens qu'en interne.
#
# Autres sorties : regwatch-artifact.html (contenu sans en-tete HTML) et
# test_light/dark/val.html (enveloppes locales pour les captures headless).
set -e
cd "$(dirname "$0")"

# data_watch.js is the watch agent's output (tools/veille_to_watchitems.py).
# Optional: without it the build falls back to the demo queue in data_c4.js.
AGENT_DATA=()
[ -f reg/nis2/data_watch.js ] && AGENT_DATA=(reg/nis2/data_watch.js)

# data_template.js is the base64 slide template (tools/embed_deck_template.py).
# Optional: without it the "Generate country slides" button reports it is absent.
DECK_TPL=()
[ -f reg/nis2/data_template.js ] && DECK_TPL=(reg/nis2/data_template.js)

# Shared shell, then one block per regulation (src/reg/<id>/), then the app.
# Adding DORA means adding a folder and one line here.
# Arrays, not strings: zsh does not word-split an unquoted scalar.
SHARED=(map_data.js data_meta.js data_flags.js)
NIS2=(reg/nis2/data_excel.js reg/nis2/data_docs.js reg/nis2/data_authorities.js
      reg/nis2/data_kpis.js reg/nis2/data_themes.js reg/nis2/data_candidates.js
      reg/nis2/data_c1.js reg/nis2/data_c2.js reg/nis2/data_c3.js reg/nis2/data_c4.js)
REC=(reg/rec/data_countries.js)
# Documentation de l'outil, corpus de l'assistant technique : construite par
# tools/build_devdocs.py, transverse aux reglementations.
DEVDOCS=()
[ -f data_devdocs.js ] && DEVDOCS=(data_devdocs.js)
[ -f data_devcode.js ] && DEVDOCS=($DEVDOCS data_devcode.js)
APP=(app_i18n.js app_reg.js app_part1.js app_part2.js app_kpi.js app_kpi_xlsx.js
     app_corpus.js app_chat.js app_dev.js app_deck.js
     app_boot.js)          # doit rester en dernier : voir l'en-tete du fichier
# La version client se passe de app_dev.js : sans lui, aucune vue technique
# n'existe, et regHasTab refuse deja ses onglets a tout role autre que
# developpeur - qui n'est plus proposable puisque l'option est retiree.
CLIENT_APP=(${APP:#app_dev.js})

# Un bundle par version. Le controle de taille vaut pour les deux : c'est lui
# qui a rattrape le jour ou bash n'eclatait pas les tableaux.
build_bundle () {
  local out=$1; shift
  local files=("$@")
  cat $files > $out
  node --check $out
  local want=0 f
  for f in $files; do want=$(( want + $(wc -c < $f) )); done
  local got=$(wc -c < $out)
  if [ "$want" -ne "$got" ]; then
    echo "$out incomplet : $got octets ecrits, $want attendus (${#files} fichiers)" >&2
    exit 1
  fi
}

CLIENT_FILES=($SHARED $NIS2 $REC $AGENT_DATA $DECK_TPL $CLIENT_APP)
TEAM_FILES=($SHARED $NIS2 $REC $DEVDOCS $AGENT_DATA $DECK_TPL $APP)
build_bundle bundle.js $CLIENT_FILES
build_bundle bundle-equipe.js $TEAM_FILES

# Le squelette client : les blocs marques DEV n'y figurent pas. Les retirer
# plutot que de les cacher - un onglet cache reste dans la page, et le role
# Developpeur y resterait selectionnable.
awk '/<!-- DEV:START -->/{skip=1} !skip; /<!-- DEV:END -->/{skip=0}' \
  shell_top.html > shell_client.html
if grep -q 'data-v="dev"' shell_client.html; then
  echo "le squelette client contient encore les onglets techniques" >&2
  exit 1
fi

{ cat shell_client.html; echo '<script>'; cat bundle.js; echo '</script>'; } > regwatch-artifact.html
{ cat shell_top.html; echo '<script>'; cat bundle-equipe.js; echo '</script>'; } > artifact-equipe.html

{ echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  echo '</head><body>'
  cat regwatch-artifact.html
  echo '</body></html>'
} > regwatch.html

{ echo '<!doctype html><html><head><meta charset="utf-8"></head><body>'
  cat regwatch-artifact.html
  echo '</body></html>'
} > test_light.html

{ echo '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"></head><body>'
  cat regwatch-artifact.html
  echo '</body></html>'
} > test_dark.html

{ echo '<!doctype html><html><head><meta charset="utf-8"></head><body>'
  echo '<script>localStorage.setItem("regwatch-proto-v1",JSON.stringify({overrides:{},manual:[],role:"validator"}));</script>'
  cat regwatch-artifact.html
  echo '</body></html>'
} > test_val.html

# La version equipe, en fichier autonome comme l'autre.
{ echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  echo '</head><body>'
  cat artifact-equipe.html
  echo '</body></html>'
} > regwatch-equipe.html

# La copie vers la racine etait une etape manuelle, decrite dans le README et
# oubliee : les sources partaient dans un commit pendant que la page publiee
# restait a la version d'avant. C'est le build qui la fait maintenant.
#
# Seule la version client monte a la racine : c'est elle que GitHub Pages sert.
cp regwatch.html ../regwatch.html
cp regwatch.html ../index.html
cp regwatch-equipe.html ../regwatch-equipe.html

echo
echo "client : $(( $(wc -c < ../regwatch.html) / 1024 )) Ko  -> regwatch.html, index.html"
echo "equipe : $(( $(wc -c < ../regwatch-equipe.html) / 1024 )) Ko  -> regwatch-equipe.html"
