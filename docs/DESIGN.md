# Ultimate Claude Code Setup V2 — design

> Actualizare 22.11.2026. Repository-ul este public. Pentru politica actuală de profiluri, review și dovezi v2, vezi [README](../README.md). Documentul păstrează contextul deciziei inițiale.


Data: 16 noiembrie 2026. Stare: **aprobat de utilizator pe 17.11.2026, cu o schimbare: agentul propriu `code-reviewer` rămâne**. Implementat de atunci: `uc-core` (Planurile 1 și 1b), migrarea Mac-ului (Planul 2) și `uc-excel` (Planul 4); ce s-a verificat, cum și ce a rămas neverificat e în `docs/verification/`. `uc-web`, installerul și benchmark-ul nu sunt încă făcute.
Înlocuiește `SETUP-SPEC.md` (v3) după aprobare. Sursele auditului: patru cercetări web din 16.11.2026 (versiuni și linkuri în Anexa A).

## 1. Intenție

Un singur sistem Claude Code, identic ca filosofie pe macOS și pe Windows nativ, care lucrează ca o echipă de ingineri:
arhitectură înainte de cod, design UI serios, teste reale, review independent, continuitate între sesiuni.
Acoperă două familii de proiecte: aplicații web/SaaS și Excel/VBA + automatizări Windows.

De ce: setup-ul v3 optimiza pentru context minim și interzicea agenții proprii; utilizatorul vrea acum calitate maximă a
rezultatului, cu complexitate acolo unde e justificată (Intelligent Complexity), nu minimalism.

## 2. Scopuri, non-scopuri, anti-scopuri

**Scopuri**
- Fiecare etapă a lucrului are un singur proprietar (tabelul din §6).
- Trei niveluri de rigoare (MINIMAL, STANDARD, STRICT) care schimbă verificarea, nu libertatea de gândire.
- Totul fixat la o versiune, instalabil și dezinstalabil reproductibil pe Mac și Windows. Excepție: plugin-urile
  proprii (`uc-core`, `uc-excel`) nu au `version`, ca o instalare din git să urmeze commiturile (cu `version` fix,
  `claude plugin update` nu aduce nimic nou). Pe Mac, marketplace-ul adăugat din folder le încarcă direct din repo:
  orice modificare, chiar necomisă, ajunge în Robot SAP la următoarea sesiune.
- Efectul setup-ului este măsurat (benchmark §10), nu presupus.

**Non-scopuri**
- Nu instalăm framework-uri întregi (ECC, gstack). Nu construim un al doilea sistem de memorie sau de planificare.
- Nu optimizăm pentru număr minim de tokeni; contextul se măsoară și se justifică, dar nu e criteriul principal.
- Agent teams (experimental) rămân oprite.

**Anti-scopuri** (eșec chiar dacă „merge")
- Două componente care concurează pe aceeași etapă.
- Un installer care modifică singur `settings.json`, permisiuni, MCP, hooks existente sau `CLAUDE.md`.
- Reguli care împing spre cea mai simplă soluție indiferent de context.
- Ceva declarat „testat" fără să fi rulat pe mașina respectivă.

## 3. Constrângeri verificate

- Claude Code nu are profiluri native; există `--settings <fișier>` pe sesiune, `CLAUDE_CONFIG_DIR` și straturi de setări.
- Agenții livrați prin plugin ignoră câmpurile `hooks`, `mcpServers` și `permissionMode`.
- Skills-urile unui plugin nu pot fi ascunse individual (`skillOverrides` nu li se aplică).
- Sandbox-ul nu există pe Windows nativ: acolo garanțiile sunt doar reguli `deny` și hooks.
- Pe Windows, hooks-urile rulează implicit prin Git Bash (sau PowerShell dacă lipsește); shim-urile npm `.cmd` nu merg în forma exec.
- Superpowers ≥ 7.0.2 refuză execuția planurilor în afara unui repo git cu cel puțin un commit.
- Editarea VBA din exterior cere „Trust access to the VBA project object model" (setare sensibilă, doar pe mașina de dezvoltare).
- Utilizatorul e pe planul Pro: benchmark-urile costă și se rulează doar cu aprobare, după o estimare.
- Mașina Windows țintă: Windows 11, Excel pe 64 de biți (ediția Excel și drepturile de administrator se verifică la detect).

## 4. Abordări considerate

1. **Pluginuri proprii într-un marketplace privat + installer subțire — ALEASĂ.** Versionarea, fixarea, activarea pe scope și
   dezinstalarea vin de la Claude Code; installerul doar verifică dependențe, înregistrează marketplace-ul și propune
   modificările sensibile. Cost: limitările agenților de plugin (§3).
2. **Installer care copiază fișiere în `~/.claude`.** Control total, dar backup/rollback/detectare/uninstall scrise de noi,
   pe două sisteme de operare. Respinsă: partea cea mai fragilă ar fi a noastră.
3. **Evoluția treptată a setup-ului v3, fără pachet.** Ieftin, dar nereproductibil pe Windows și fără template-uri. Respinsă.

Utilizatorul a ales: un singur sistem care înlocuiește v3 peste tot (varianta „B"). Varianta 1 de împachetare este
recomandarea mea, neconfirmată explicit — se confirmă prin aprobarea acestui document.

## 5. Arhitectura

### 5.1 Repo-ul `ultimate-claude` (privat, GitHub)

```
ultimate-claude/
  .claude-plugin/marketplace.json      # marketplace privat, 3 pluginuri
  plugins/
    uc-core/     agents/ skills/ hooks/ profiles/ templates/
    uc-web/      agents/ skills/ templates/web-app/
    uc-excel/    agents/ skills/ hooks/ templates/excel-vba/
  components.lock.json                 # componentele terțe: sursă, versiune fixată, licență, scope, profil,
                                       # comandă install / uninstall / verificare, cost always-on măsurat
  installer/                           # §8
  bench/                               # §10
  docs/adr/                            # deciziile acestui sistem
```

Hooks-urile și installerul se scriu în **Node.js** (un singur cod pentru Mac și Windows; Node ≥ 22 e oricum cerut de
Context7 CLI și Playwright CLI). *Decizia mea — vezi §12.*

### 5.2 `uc-core` (activ pe proiect; vezi §9)

| Tip | Nume | Rol |
|---|---|---|
| Agent | `architect` | explorează 2–3 arhitecturi, compromisuri, scrie ADR; preîncarcă skills-urile mattpocock `codebase-design` și `domain-modeling`; model Opus, efort high; doar citire + scriere în `docs/adr/` |
| Agent | `qa-engineer` | strategie de testare proporțională cu riscul, edge cases, lacune de acoperire; poate rula testele |
| Agent | `code-reviewer` | review de conformitate, după review-ul de cod al Superpowers: criteriile din spec, ADR-urile, regulile proiectului, riscul transversal, rezolvarea constatărilor Superpowers; decizia APPROVE/BLOCK; nu repetă corectitudinea linie cu linie; doar citire |
| Agent | `release-gate` | verifică criteriile de acceptanță din spec față de dovezi (output de teste, build, screenshot); verdict PASS/FAIL cu motive; doar citire + rulare |
| Skill | `complexity-check` | ghid de decizie Intelligent Complexity: când o abstracție/strat e justificat (scalabilitate, mentenanță, fiabilitate, securitate, performanță, extensibilitate, UX, testabilitate) și când nu |
| Skill | `product-discovery` | caută un skill suplimentar când proiectul cere o capabilitate pe care skill-urile, instrumentele și sistemul actual nu o acoperă |
| Skill | `delivery-report` | raportul final: ce s-a făcut, ce s-a verificat și cum, ce a rămas neverificat |
| Skill | `uc-profile` | explică profilul activ și ce impune |
| Hook | `block-destructive` | PreToolUse, în plugin; varianta globală veche rămâne până la installer (vezi §9) |
| Hook | `profile-gate` | în STRICT: la Stop cere dovada de verificare înainte de „gata"; în MINIMAL/STANDARD nu face nimic |

Review-ul de securitate rămâne la comanda nativă `/security-review` (plus pluginul `security-guidance` deja instalat) —
nu scriem agent propriu pentru el. Review-ul de cod (pe task în SDD și final, pe tot branch-ul) îl face Superpowers;
agentul propriu `code-reviewer` (cerut de utilizator) face review-ul de conformitate și ia decizia (aprobat de utilizator pe
17.11.2026, după auditul Superpowers). `/code-review` nativ rămâne disponibil la cerere, ca a doua opinie. *6 agenți proprii, nu 7.*

Filosofia (Intelligent Complexity, reguli de delegare, precedență) stă într-un bloc scurt din `~/.claude/CLAUDE.md`,
sub 40 de linii (ridicat de la 35 pe 17.11.2026, pentru regula de execuție), propus de installer și aplicat doar cu acord. Un plugin nu poate livra `CLAUDE.md`.

### 5.3 `uc-web` (activ doar în proiectele web)

- Agent `frontend-reviewer`: ierarhie vizuală, consistență cu design system-ul, accesibilitate, responsive; lucrează pe
  capturi reale făcute cu Playwright CLI la trei lățimi.
- Skill `ui-improve`: fluxul pentru „îmbunătățește interfața" — (1) UI UX Pro Max stabilește/actualizează design system-ul
  în `design-system/MASTER.md`; (2) Frontend Design dă direcția de implementare; (3) implementare; (4) capturi Playwright CLI;
  (5) `frontend-reviewer`; (6) iterație până trece. Obligă schimbări de layout/ierarhie/UX, nu doar de culori.
- Template `web-app`: `CLAUDE.md` de proiect, `docs/adr/`, `docs/specs/`, `design-system/`, `.claude/rules/` cu `paths:`,
  schelet de teste, checklist de securitate, performanță și release.

### 5.4 `uc-excel` (activ doar în proiectele Excel/VBA; lucrul zilnic pe Mac, verificarea finală pe Windows)

Revizuit pe 17.11.2026, după studiul proiectului `Robot SAP` (decizia utilizatorului: fluxul hibrid). Înlocuiește
varianta inițială cu xlflow/xlwings prin Excel COM și Pester.

**Intenție.** Un proiect Excel/VBA se dezvoltă ca text: sursele VBA (`.bas`, `.cls`) stau în git, workbook-ul se
construiește din surse fără Excel, iar logica se testează fără Excel. Windows, Excel (și SAP, la `Robot SAP`) servesc
doar verificării finale, făcută de utilizator. De ce: fluxul există deja în `Robot SAP` și funcționează (build Python,
teste în LibreOffice headless, linter propriu); Claude lucrează sigur și verificabil pe text; testele rulează pe Mac.

**Scopuri.** Nicio modificare de cod VBA fără lint, build, verificarea compilării și teste. Niciun workbook suprascris
fără backup. Un review VBA specializat. Fluxul existent al proiectului se păstrează, nu se înlocuiește.

**Non-scopuri.** Claude nu automatizează Excel sau SAP pe Windows. Fără verificări de compatibilitate 32/64 de biți
(decizia utilizatorului). Fără xlflow, xlwings, Pester, PSScriptAnalyzer, MCP-ul Excel și fără spike-ul dintre ele.

**Anti-scopuri.** O modificare făcută direct în `.xlsm` care nu există în surse. Un workbook suprascris fără backup.
Un test slăbit ca să treacă. Două fișiere de documentație care spun același lucru.

**Componente.**
- Agent `excel-vba-reviewer` (doar citire): performanță (`ScreenUpdating`, `Calculation`, `EnableEvents` restaurate;
  bucle pe celule în loc de tablouri; `Select`/`Activate`); tratarea erorilor și revenirea (`On Error` fără resetare,
  starea Excel nerestaurată pe calea de eroare, erori înghițite); integritatea datelor (scrieri parțiale, tipuri, date și
  numere dependente de setările regionale, celule goale); Excel Object Model (referințe necalificate la
  `ActiveSheet`/`ActiveWorkbook`, evenimente, obiecte neeliberate). Rulează la orice schimbare de cod VBA, în orice
  profil, pe modelul sesiunii. Verifică doar aceste categorii specifice VBA; review-ul general de cod rămâne al
  Superpowers, fără dublură. Raportul lui (constatări cu fișier:linie, gravitate, încredere ≥ 80, verdict
  APPROVE/BLOCK) intră în review-ul de conformitate al `code-reviewer`. Scris de noi: nu există unul public bun.
- Skill `vba-workflow`: ordinea fixă după fiecare schimbare de cod VBA, cu comenzile luate din `CLAUDE.md`-ul proiectului:
  (1) backup în `backups/` al workbook-ului care urmează să fie scris; (2) editare doar în sursele text, niciodată direct
  în `.xlsm`; (3) lint; (4) build doar pentru varianta pe care proiectul o declară livrabilă (la `Robot SAP`: cea cu
  licență); (5) verificarea compilării; (6) teste: toate cele existente rulează, comportamentul nou primește teste,
  cele afectate se actualizează; (7) documentația utilizatorului se actualizează într-un singur fișier (la `Robot SAP`:
  `GHID.md`); nu se întreține o a doua copie cu același conținut. Se aplică la orice schimbare VBA, inclusiv una
  de mărime MINIMAL (regula explicită a utilizatorului). O impune skill-ul, fără hook în plus.
- **Ce înseamnă „verificat” pe Mac.** Mac-ul e doar mașina de dezvoltare: utilizatorul nu urmărește dacă macro-ul
  sau Excel-ul merg pe Mac. Criteriile de acceptanță ale unei schimbări VBA sunt lint, build, compilare și teste.
  Rularea în Excel și SAP pe Windows e a utilizatorului și nu e criteriu pentru `release-gate`; apare doar ca notă
  în `delivery-report`. Așa, nici STRICT nu pică din cauza Windows-ului.
- Hook `workbook-guard` (PreToolUse pe `Write|Edit|NotebookEdit` și `Bash|PowerShell`): o scriere într-un
  `.xlsm`/`.xlsb`/`.xlam` cere în `backups/` o copie a acelui workbook făcută după începutul sesiunii (notat de un hook
  SessionStart). Recunoaște Write/Edit pe astfel de fișiere și comenzile shell care numesc un astfel de fișier ca
  destinație (copiere, mutare, redirecționare, ștergere, argument al unui script). Un script de build care scrie un
  workbook fără să-l numească în comandă nu poate fi recunoscut: pentru el răspunde pasul 1 din `vba-workflow`.
  MINIMAL și STANDARD: avertizează; STRICT: blochează.
- Template `excel-vba`: `CLAUDE.md` de proiect (ce este, comenzile de lint, build, compilare și teste, fișierul de
  documentație, regulile proiectului), `.claude/settings.json` cu `enabledPlugins` pentru `uc-core` și `uc-excel`,
  `.gitignore` cu `backups/`, workbook-urile construite și arhivele.
- Unelte pe Mac, pe proiect: LibreOffice (Homebrew) pentru compilare și teste; bibliotecile Python ale build-ului
  într-un mediu virtual al proiectului, nu global (Python-ul din Homebrew refuză instalarea globală, iar mediul izolează
  versiunile). Fiecare apare în `components.lock.json` cu versiune fixată.

**Aplicarea pe `Robot SAP`** (parte din Planul 4): sursele din `Robot_SAP_proiect_v3.10.zip` intră în repo-ul git al
proiectului; `REZUMAT_PROIECT.md` devine `CLAUDE.md`-ul proiectului, ca să nu existe două rezumate; rămâne un singur
`GHID.md` (cel mai nou, din `livrabile/`); build-ul variantei cu licență și toate testele existente trebuie să treacă pe Mac.
- Profilul implicit al proiectului: STANDARD, scris în `.claude/settings.json` (nu în `settings.local.json`, care e în
  afara git); STRICT se cere pe sesiune cu `profil strict`.
- Uneltele de build și de test rămân în proiect (`tools/`); `uc-excel` nu livrează un toolchain comun. Se face unul
  comun doar dacă apare al doilea proiect Excel.
- Scripturile de test se adaptează ca să ruleze pe Mac (fără `timeout` GNU, Python-ul care vede LibreOffice, un profil
  LibreOffice separat în loc de cel al utilizatorului, fără să închidă un LibreOffice deschis) și rămân compatibile cu
  mediul în care rulau înainte.
- Versiunile livrate din `livrabile/` (v3.7.1–v3.10, câțiva MB) intră în git. În afara git: ieșirea temporară a
  build-ului, `backups/` și arhiva zip.

**Lăsat celui care construiește:** formularea exactă a agentului și a skill-ului; euristica precisă prin care hook-ul
recunoaște o comandă de scriere; versiunile exacte fixate pentru LibreOffice și bibliotecile Python.

### 5.5 Componente terțe (toate în `components.lock.json`, fixate)

| Componentă | Decizie | Scope / activare |
|---|---|---|
| Superpowers 7.0.2 | păstrat, proprietarul procesului | global |
| mattpocock/skills (cele 4–5 deja instalate) | păstrat, vocabular de arhitectură + ADR | global |
| Context7 — CLI `ctx7` + skill, fără MCP | păstrat | global |
| Pluginuri LSP native (TypeScript, Python, C#) | păstrat, prima alegere pentru navigare | global |
| security-guidance | păstrat; dependență declarată a `uc-core` (decizia utilizatorului, 17.11.2026). Review-urile lui cu Opus sunt oprite global (`ENABLE_CODE_SECURITY_REVIEW=0`), rămân avertismentele automate | doar unde e activ `uc-core` |
| Frontend Design (Anthropic) | păstrat | proiecte web |
| UI UX Pro Max v2.15.0 | păstrat; instalat global (decizia utilizatorului, 17.11.2026: interfață în aproape toate proiectele). Aduce 7 skill-uri, fără hooks și fără MCP | global |
| Playwright CLI | **înlocuiește** Playwright MCP | proiecte web |
| Planning with Files | restrâns | doar STRICT sau lucru pe mai multe sesiuni; `PWF_SKIP_SUBAGENTS=1` |
| Graphify | restrâns, fără `--strict` | opt-in pe repo-uri mari, după ce LSP-ul nu ajunge |
| Ponytail | opt-in, oprit implicit | doar pentru refactoring/audit, la cerere |
| ccusage | păstrat, `npx` cu versiune fixată | la cerere, zero context |
| ECC | doar sursă: preluăm și adaptăm **numai** `database-reviewer` (schemă, interogări, migrații — etapă fără alt proprietar). `build-error-resolver` (se suprapune cu debugging-ul Superpowers), `refactor-cleaner` (cu `/simplify` și Ponytail) și reviewerii pe limbaje (cu `/code-review`) nu se preiau | în `uc-web`, cu atribuire MIT |
| gstack | nu se instalează (suport Windows minimal) | — |
| Impeccable | nu acum (se suprapune cu Frontend Design; Windows neconfirmat) | reevaluare ulterioară |
| Superdesign, Serena, GitNexus, Rubberduck | respinse | — |
| RTK | **păstrat** pentru economia de tokeni pe planul Pro, cu ocolire la verificare: `code-reviewer`, `qa-engineer` și `release-gate` rulează comenzile cu `rtk bypass`, ca să vadă ieșirea completă (decizia utilizatorului, 17.11.2026; înlocuiește „scos” din brief) | global, doar pe Mac |
| pluginurile `headroom` și `code-graph` de pe Mac | de auditat în faza de migrare; propunerea mea: scoase (compresor, respectiv al doilea graf) | — |

## 6. Cine deține fiecare etapă

| Etapă | Proprietar |
|---|---|
| Identificarea unui skill pentru o capabilitate lipsă | skill `product-discovery` |
| Brainstorm, plan, execuție, TDD, debugging | Superpowers (alegerea între inline și SDD: regula din `CLAUDE.md` global) |
| Arhitectură și ADR | agent `architect` (+ skills mattpocock) |
| Decizia „cât de complex" | skill `complexity-check` |
| Plan persistent pe mai multe sesiuni | Planning with Files (doar STRICT) |
| Documentația bibliotecilor | Context7 |
| Navigare în cod | LSP nativ; Graphify opt-in |
| Design system și decizii UX | UI UX Pro Max |
| Direcția estetică a implementării | Frontend Design |
| Verificare în browser | Playwright CLI; Chrome doar cu `--chrome` |
| Review UI | agent `frontend-reviewer` |
| Strategia de testare | agent `qa-engineer` |
| Review de cod | Superpowers (pe task în SDD, final pe branch) (`/code-review` nativ doar la cerere) |
| Review de conformitate și decizia APPROVE/BLOCK | agent `code-reviewer` |
| Review de securitate | `/security-review` nativ + `security-guidance` |
| Review VBA | agent `excel-vba-reviewer` |
| Review bază de date (schemă, interogări, migrații) | agent `database-reviewer` (din ECC, adaptat) |
| Poarta de livrare | agent `release-gate` + skill `delivery-report` |
| Măsurarea consumului | `/usage`, `/context all`, `/skill-doctor`; ccusage pentru istoric |

## 7. Profiluri

Două straturi: **ghidaj** (un tabel de 6–8 linii în `CLAUDE.md` global) și **garanții** (hooks care citesc variabila
`UC_PROFILE`).

| | MINIMAL | STANDARD (implicit) | STRICT |
|---|---|---|---|
| Când | typo, redenumire, bugfix într-o funcție | dezvoltare obișnuită | sisteme critice, migrații, VBA important, securitate, date |
| Proces | direct + o verificare | brainstorm → plan → execuție aleasă pe plan → verificare | + `architect` (după brainstorm) și ADR, plan persistent, `qa-engineer` |
| Review | — | review-urile Superpowers + `code-reviewer` (conformitate) | STANDARD + `/security-review` + reviewerul de domeniu + `release-gate` |
| Garanții (hooks) | `block-destructive` | la fel | + `profile-gate`, `workbook-guard` strict |

Mecanism (gândit pentru aplicația desktop, suprafața principală a utilizatorului, unde nu există flag-uri de pornire).
Hooks-urile află profilul în această ordine:
1. marcajul de sesiune `~/.claude/uc/sessions/<session_id>.json`, scris de skill-ul `uc-profile` când utilizatorul spune
   „profil STRICT" (hooks-urile primesc `session_id` la fiecare apel);
2. `env.UC_PROFILE` din `.claude/settings.json` al proiectului (profilul implicit al proiectului, pus de template);
3. altfel STANDARD.

În terminal există în plus lansatoarele `uc minimal|standard|strict`, care pornesc `claude --settings profiles/<profil>.json`
(adăugarea lor în PATH e o modificare propusă, nu automată). Profilul **nu** activează sau dezactivează pluginuri:
activarea pe tip de proiect se face nativ, prin `enabledPlugins` în `.claude/settings.json` al proiectului, scris de
template (`uc-web` în proiectele web, `uc-excel` în cele Excel, Planning with Files unde e nevoie). Designul nu depinde
de niciun spike pentru asta.

**Dovada de verificare** (ce verifică `profile-gate` în STRICT; revizuit pe 18.11.2026 după audit): când sesiunea intră în
STRICT, un hook notează amprenta codului (într-un proiect git: hash-ul arborelui a tot ce ar intra într-un commit, fără
folderele `.uc/`, fără `.claude/agent-memory/`, fără documentele de design - specificații, planuri, ADR-uri, glosar - și
fără folderele de worktree), deci contează orice editare, inclusiv prin Bash sau scripturi. Gate-ul verifică folderul
principal și fiecare worktree în care a lucrat sesiunea. Dacă
sesiunea editase deja fișiere înainte să treacă în STRICT, punctul de plecare e necunoscut și orice oprire cere un PASS.
Agentul `release-gate` ia amprenta înainte și după verificări și scrie în rădăcina proiectului
`.uc/verification/<timestamp>.json` cu comenzile rulate, codurile de ieșire, criteriile, verdictul, `treeBefore` și
`tree`. La Stop, dacă amprenta s-a schimbat și nicio dovadă PASS completă (verificări trecute, cel puțin un criteriu și
toate VERIFIED, nimic neverificat, aceeași amprentă înainte și după verificări) nu are exact amprenta curentă, hook-ul blochează o dată pentru starea respectivă; a doua oprire pe aceeași stare
trece (fără bucle) și e consemnată în `delivery-report` ca neverificată. În afara git rămâne regula veche: ora ultimei
editări Edit/Write față de cel mai nou PASS.

## 8. Installer

- Un singur program Node (`installer/uc-setup.mjs`) cu două intrări subțiri: `install.ps1` și `install.sh`, care doar
  verifică Node și îl apelează.
- Etape: **detect** (versiuni Claude Code, Git, Node, Python, uv, Excel; componente deja instalate) → **plan** (implicit
  doar afișează; echivalentul `-WhatIf`) → **backup** cu timestamp pentru tot ce urmează să atingă → **apply** (doar cu
  `--apply`) → **verify** → **raport** `uc-install-report.md`.
- Ce face singur (după `--apply`): adaugă marketplace-ul privat și instalează pluginurile `uc-*`.
- Componentele terțe se instalează la versiunile din lockfile, dar **fiecare cu acord separat**, după ce installerul arată
  ce hooks, servere MCP și injecții de context aduce componenta respectivă.
- Componentele opt-in (Ponytail, Graphify, Planning with Files, MCP-ul Excel) **nu se instalează** implicit; sunt în
  lockfile cu `default: false` și se adaugă cu `uc-setup add <nume>`, global sau pe proiect.
- Repo-ul e privat, pe contul GitHub al utilizatorului; pe Windows accesul se face cu `gh auth login`, rulat de utilizator.
  Sistemul e gândit pentru mașinile utilizatorului, nu pentru distribuție publică.
- Ce doar propune, ca diff, și aplică numai cu acord pe fiecare element: `settings.json`, permisiuni, servere MCP, hooks
  existente, blocul din `CLAUDE.md`, PATH.
- Idempotent: a doua rulare nu schimbă nimic. Fără suprascrieri silențioase: un fișier modificat de utilizator oprește
  pasul și e raportat.
- `~/.claude/uc/state.json` ține tot ce a scris installerul (cale, hash, backup). `--uninstall` și `--rollback <dată>`
  lucrează exclusiv pe baza lui.
- După fiecare instalator terț compară starea înainte/după și raportează orice regulă, hook sau apel nefixat apărut în plus.

## 9. Migrarea Mac-ului (v3 → V2)

Făcută pe 17.11.2026 (Planul 2), cu backup în `~/.claude/backups/2026-11-17/` și acord pe fiecare punct.
Detalii și comenzi de restaurare: `docs/verification/mac-migration.md`.

- `~/.claude/CLAUDE.md` rescris cu blocul V2 din `installer/proposals/global-claude-md.md` (dispare
  „Do not create custom subagents"; agent teams rămân oprite).
- RTK rămâne (vezi §5.5).
- `~/.claude/hooks/block-destructive.sh` rămâne global, pentru că `uc-core` nu e activ global (decizia
  utilizatorului). Versiunea Node din `uc-core` îl va înlocui prin installer (Planul 5), inclusiv pe Windows.
- Arhivate: `~/.claude/PLAYBOOK.md` (ghidul v3) și `~/.claude/hooks/notirelay-exe.sh` (nefolosit, proiect absent).
- `ENABLE_CODE_SECURITY_REVIEW=0` rămâne global (decizia utilizatorului): security-guidance rulează doar
  avertismentele automate; review-ul de securitate complet se face cu `/security-review`.
- Absente deja, fără acțiune: Playwright MCP, pluginurile `headroom`, `code-graph`, `engineering`, `design`, `data`,
  `productivity`, `datarobot`, `firecrawl`, documentele `SETUP-SPEC.md` și `RAPORT-setup.md`, proiectele
  `notirelay` și `telegram-mt5-copier`.

## 10. Teste și benchmark

- **Installer:** teste automate într-un `CLAUDE_CONFIG_DIR` temporar (instalare, a doua rulare fără schimbări, fișier
  modificat de utilizator, uninstall, rollback), pe macOS local și pe un runner GitHub Actions `windows-latest`.
- **Pluginuri:** `claude plugin eval` — cazuri pentru declanșarea corectă a fiecărui skill și pentru calitatea verdictelor
  agenților (ex.: `excel-vba-reviewer` trebuie să găsească 5 defecte plantate într-un modul).
- **Context:** `/context all` și `/skill-doctor` înainte/după, pe profil. Bugetul always-on se fixează după prima măsurare.
- **Benchmark de calitate:** 6 sarcini fixe (feature web, „îmbunătățește interfața", bugfix, refactor, macro VBA nou,
  optimizare VBA), rulate cu configurație goală vs. fiecare profil, de 3 ori fiecare. Metrici: teste de acceptanță ascunse,
  scor pe o rubrică dat de un evaluator care nu știe configurația, tokeni/cost (ccusage), durată. Sarcinile, testele
  ascunse și rubrica le scriu eu și le aprobă utilizatorul; evaluatorul e un agent nou, fără acces la configurație, iar
  utilizatorul verifică prin sondaj. Se începe cu un pilot mic (2 sarcini × 2 configurații × 2 rulări) și se extinde
  doar după o estimare de cost aprobată. Regula de decizie: o componentă care nu aduce o îmbunătățire măsurabilă în
  categoria ei e propusă spre scoatere; decide utilizatorul. Sarcinile VBA rulează doar pe mașina Windows cu Excel.
- **Neverificabil fără mașina reală:** rularea în Excel și în SAP pe Windows; o face utilizatorul (§5.4). Logica VBA se testează pe Mac în LibreOffice.

## 11. Fazele de implementare

0. Spike-uri (aruncabile): agenți de plugin cu `skills:` preîncărcate; marcajul de sesiune citit de hooks în aplicația
   desktop; hooks Node pe Windows (așteaptă mașina Windows). Spike-ul xlflow vs xlwings a căzut odată cu §5.4 revizuit.
1. Repo + `uc-core` + lockfile. 2. Migrarea Mac-ului. 3. `uc-web`. 4. `uc-excel`. 5. Installer + teste.
6. Benchmark. 7. Test pe mașina Windows reală.

## 12. Deciziile mele, de verificat de utilizator

- Installer în Node cu intrare `.ps1`, în loc de PowerShell pur (brief-ul cerea PowerShell): un singur cod pentru două
  sisteme, după alegerea „B".
- 6 agenți proprii în loc de 7 (`code-reviewer` păstrat la cererea utilizatorului), plus `database-reviewer` adaptat din ECC; doar security review rămâne nativ.
- Profilul se alege pe sesiune (verbal, prin `uc-profile`) sau pe proiect, nu prin flag-uri; nu comută pluginuri.
- Dovada de verificare în STRICT este un fișier scris de `release-gate`; hook-ul blochează o singură dată.
- Componentele opt-in nu se instalează implicit; fiecare componentă terță cere acord separat.
- Benchmark-ul pornește cu un pilot mic, evaluat de un agent „orb", nu de un om.
- Ponytail oprit implicit; Planning with Files doar în STRICT; Graphify opt-in după LSP.
- Playwright CLI în loc de MCP. Impeccable amânat.
- Skills-urile mattpocock rămân proprietarul vocabularului de arhitectură.
- `headroom` și `code-graph` propuse spre scoatere de pe Mac.
- Rolurile față de Superpowers (aprobat de utilizator pe 17.11.2026, după audit; Planul 1b): `uc-core` alege executorul
  (inline sau SDD) după criteriile Superpowers, scrise ca regulă în `CLAUDE.md` global, și îl arată la review-ul
  planului; Superpowers face metodologia și propriile review-uri de cod; `code-reviewer` face review-ul de conformitate
  înainte de finalizarea branch-ului; `qa-engineer` nu repetă TDD-ul Superpowers.

## 13. Rămas neverificat

- Dacă un skill poate afla `session_id` pentru a scrie marcajul de profil (altfel îl scrie un hook UserPromptSubmit).
- Comportamentul pe Windows nativ pentru Context7 CLI, ccusage, Playwright CLI, mattpocock/skills; MCP pe Windows.
- Schimbările Claude Code din iulie–octombrie 2026 (changelog-ul citit acoperă doar 6–13 noiembrie).
- Cifrele de economie ale Ponytail și Graphify (auto-raportate).

## Anexa A — versiuni găsite pe 16.11.2026

Superpowers v7.0.2 (MIT) · planning-with-files v3.28.1 (MIT) · ctx7 0.12.1 (MIT) · ccusage v20.0.51 (MIT) ·
ECC v2.2.3 (MIT) · gstack v1.99.5.0 (MIT) · Ponytail v5.3.3 (MIT) · mattpocock/skills 1.3.2 (MIT) ·
UI UX Pro Max v2.15.0 (MIT) · Playwright CLI v0.1.24 / MCP v0.0.85 (Apache-2.0) · Impeccable cli-v4.9.2 (Apache-2.0) ·
Graphify v0.9.111 (Apache-2.0) · code-review-graph v2.4.0 (MIT) · Serena v2.1.0 (GPL-3.0+) ·
sbroenne/mcp-server-excel 2.6.12 (MIT) · xlwings 0.37.9 (BSD-3) · xlflow v0.7.0 (MIT) ·
Pester 6.2.0 · PSScriptAnalyzer 1.25.0. Anii unor date de release și câteva licențe sunt neconfirmate pe sursa primară.
