# Ultimate Claude Code Setup V2 — design

Data: 16 noiembrie 2026. Stare: **aprobat de utilizator pe 17.11.2026, cu o schimbare: agentul propriu `code-reviewer` rămâne**. Nimic din acest document nu a fost instalat sau testat.
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
- Totul fixat la o versiune, instalabil și dezinstalabil reproductibil pe Mac și Windows.
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

### 5.2 `uc-core` (activ global)

| Tip | Nume | Rol |
|---|---|---|
| Agent | `architect` | explorează 2–3 arhitecturi, compromisuri, scrie ADR; preîncarcă skills-urile mattpocock `codebase-design` și `domain-modeling`; model Opus, efort high; doar citire + scriere în `docs/adr/` |
| Agent | `qa-engineer` | strategie de testare proporțională cu riscul, edge cases, lacune de acoperire; poate rula testele |
| Agent | `code-reviewer` | review independent, în context proaspăt: bug-uri, calitate, mentenabilitate, respectarea ADR-urilor și a spec-ului; doar citire. Este reviewerul pe care îl folosește pasul de review din Superpowers |
| Agent | `release-gate` | verifică criteriile de acceptanță din spec față de dovezi (output de teste, build, screenshot); verdict PASS/FAIL cu motive; doar citire + rulare |
| Skill | `complexity-check` | ghid de decizie Intelligent Complexity: când o abstracție/strat e justificat (scalabilitate, mentenanță, fiabilitate, securitate, performanță, extensibilitate, UX, testabilitate) și când nu |
| Skill | `product-discovery` | întrebări de produs înainte de brainstorm (utilizator, problemă, alternativă existentă, criteriu de succes) — idei preluate din gstack, rescrise, fără instalarea lui |
| Skill | `delivery-report` | raportul final: ce s-a făcut, ce s-a verificat și cum, ce a rămas neverificat |
| Skill | `uc-profile` | explică profilul activ și ce impune |
| Hook | `block-destructive` | mutat din setup-ul global actual în plugin (PreToolUse) |
| Hook | `profile-gate` | în STRICT: la Stop/TaskCompleted cere dovada de verificare înainte de „gata"; în MINIMAL/STANDARD nu face nimic |

Review-ul de securitate rămâne la comanda nativă `/security-review` (plus pluginul `security-guidance` deja instalat) —
nu scriem agent propriu pentru el. Review-ul de cod îl deține agentul propriu `code-reviewer` (cerut de utilizator);
`/code-review` nativ rămâne disponibil la cerere, ca a doua opinie, nu ca pas obligatoriu. *6 agenți proprii, nu 7.*

Filosofia (Intelligent Complexity, reguli de delegare, precedență) stă într-un bloc scurt din `~/.claude/CLAUDE.md`,
sub 35 de linii, propus de installer și aplicat doar cu acord. Un plugin nu poate livra `CLAUDE.md`.

### 5.3 `uc-web` (activ doar în proiectele web)

- Agent `frontend-reviewer`: ierarhie vizuală, consistență cu design system-ul, accesibilitate, responsive; lucrează pe
  capturi reale făcute cu Playwright CLI la trei lățimi.
- Skill `ui-improve`: fluxul pentru „îmbunătățește interfața" — (1) UI UX Pro Max stabilește/actualizează design system-ul
  în `design-system/MASTER.md`; (2) Frontend Design dă direcția de implementare; (3) implementare; (4) capturi Playwright CLI;
  (5) `frontend-reviewer`; (6) iterație până trece. Obligă schimbări de layout/ierarhie/UX, nu doar de culori.
- Template `web-app`: `CLAUDE.md` de proiect, `docs/adr/`, `docs/specs/`, `design-system/`, `.claude/rules/` cu `paths:`,
  schelet de teste, checklist de securitate, performanță și release.

### 5.4 `uc-excel` (activ doar în proiectele Excel/VBA; uneltele rulează doar pe Windows)

- Agent `excel-vba-reviewer`: performanță (ScreenUpdating, calcule, bucle pe celule vs. array), integritatea datelor,
  error handling și recovery, Excel Object Model, compatibilitate 32/64-bit. Scris de noi (nu există unul bun public);
  lista de verificări pornește de la regulile `xlflow lint`.
- Skill `vba-workflow`: backup cu timestamp → export module în `src/` → editare ca text → lint → import → rulare teste →
  comparare cu fișiere „golden" (CSV) → raport. Fără editare directă a `.frm/.frx`.
- Hook `workbook-guard` (PreToolUse): interceptează comenzile de shell care scriu într-un workbook (`xlflow push`,
  `xlwings vba import`, `excelcli` cu acțiuni de scriere, scripturi COM din `tests/`) și apelurile Write/Edit pe
  `.xlsm/.xlsb/.xlam`. Cere ca în `backups/` să existe o copie a acelui workbook creată după începutul sesiunii curente.
  În STANDARD doar avertizează; în STRICT blochează.
- Template `excel-vba`: `src/`, `tests/`, `fixtures/`, `golden/`, `backups/` (în afara git), harness Pester, standarde VBA,
  procedură de deployment și rollback.
- Unelte: `xlflow` (preferat, **de evaluat într-un spike** — proiect tânăr), `xlwings` ca rezervă matură, MCP-ul Excel
  `sbroenne/mcp-server-excel` opțional pe proiect, PSScriptAnalyzer + Pester pentru PowerShell.

### 5.5 Componente terțe (toate în `components.lock.json`, fixate)

| Componentă | Decizie | Scope / activare |
|---|---|---|
| Superpowers 7.0.2 | păstrat, proprietarul procesului | global |
| mattpocock/skills (cele 4–5 deja instalate) | păstrat, vocabular de arhitectură + ADR | global |
| Context7 — CLI `ctx7` + skill, fără MCP | păstrat | global |
| Pluginuri LSP native (TypeScript, Python, C#) | păstrat, prima alegere pentru navigare | global |
| security-guidance | păstrat; dependență declarată a `uc-core` (decizia utilizatorului, 17.11.2026). Review-urile lui cu Opus sunt oprite global (`ENABLE_CODE_SECURITY_REVIEW=0`), rămân avertismentele automate | doar unde e activ `uc-core` |
| Frontend Design (Anthropic) | păstrat | proiecte web |
| UI UX Pro Max v2.15.0 | păstrat, la cerere | skill local în proiectele cu interfață |
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
| Descoperire de produs | skill `product-discovery` |
| Brainstorm, plan, execuție, TDD, debugging | Superpowers |
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
| Review de cod | agent `code-reviewer` (`/code-review` nativ doar la cerere) |
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
| Proces | direct + o verificare | brainstorm → plan → execuție → verificare | + `architect` și ADR, plan persistent, `qa-engineer` |
| Review | — | `code-reviewer` | `code-reviewer` + `/security-review` + reviewerul de domeniu + `release-gate` |
| Garanții (hooks) | `block-destructive` | la fel | + `profile-gate`, `workbook-guard` strict |

Mecanism (gândit pentru aplicația desktop, suprafața principală a utilizatorului, unde nu există flag-uri de pornire).
Hooks-urile află profilul în această ordine:
1. marcajul de sesiune `~/.claude/uc/sessions/<session_id>.json`, scris de skill-ul `uc-profile` când utilizatorul spune
   „profil STRICT" (hooks-urile primesc `session_id` la fiecare apel);
2. `env.UC_PROFILE` din `.claude/settings.local.json` al proiectului (profilul implicit al proiectului, pus de template);
3. altfel STANDARD.

În terminal există în plus lansatoarele `uc minimal|standard|strict`, care pornesc `claude --settings profiles/<profil>.json`
(adăugarea lor în PATH e o modificare propusă, nu automată). Profilul **nu** activează sau dezactivează pluginuri:
activarea pe tip de proiect se face nativ, prin `enabledPlugins` în `.claude/settings.json` al proiectului, scris de
template (`uc-web` în proiectele web, `uc-excel` în cele Excel, Planning with Files unde e nevoie). Designul nu depinde
de niciun spike pentru asta.

**Dovada de verificare** (ce verifică `profile-gate` în STRICT): agentul `release-gate` scrie
`.uc/verification/<timestamp>.json` cu comenzile rulate, codurile de ieșire și verdictul. Un hook PostToolUse notează ora
ultimei editări din sesiune. La Stop, dacă există editări mai noi decât ultimul verdict PASS, hook-ul blochează o singură
dată cu mesajul „rulează release-gate"; a doua oprire trece (fără bucle) și e consemnată în `delivery-report` ca neverificată.

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
  existente, blocul din `CLAUDE.md`, PATH, setarea VBA trust.
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
- **Neverificabil fără mașina reală:** tot ce ține de Excel (xlflow, COM, VBA trust) — CI-ul nu are Excel.

## 11. Fazele de implementare

0. Spike-uri (aruncabile): agenți de plugin cu `skills:` preîncărcate; marcajul de sesiune citit de hooks în aplicația
   desktop; hooks Node pe Windows; `xlflow` vs `xlwings` pe o mașină cu Excel (ultimele două așteaptă mașina Windows).
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

## 13. Rămas neverificat

- Dacă un skill poate afla `session_id` pentru a scrie marcajul de profil (altfel îl scrie un hook UserPromptSubmit).
- Comportamentul pe Windows nativ pentru Context7 CLI, ccusage, Playwright CLI, mattpocock/skills; MCP pe Windows.
- Maturitatea reală a `xlflow` (ultima versiune confirmată: v0.7.0, mai 2026).
- Schimbările Claude Code din iulie–octombrie 2026 (changelog-ul citit acoperă doar 6–13 noiembrie).
- Cifrele de economie ale Ponytail și Graphify (auto-raportate).

## Anexa A — versiuni găsite pe 16.11.2026

Superpowers v7.0.2 (MIT) · planning-with-files v3.28.1 (MIT) · ctx7 0.12.1 (MIT) · ccusage v20.0.51 (MIT) ·
ECC v2.2.3 (MIT) · gstack v1.99.5.0 (MIT) · Ponytail v5.3.3 (MIT) · mattpocock/skills 1.3.2 (MIT) ·
UI UX Pro Max v2.15.0 (MIT) · Playwright CLI v0.1.24 / MCP v0.0.85 (Apache-2.0) · Impeccable cli-v4.9.2 (Apache-2.0) ·
Graphify v0.9.111 (Apache-2.0) · code-review-graph v2.4.0 (MIT) · Serena v2.1.0 (GPL-3.0+) ·
sbroenne/mcp-server-excel 2.6.12 (MIT) · xlwings 0.37.9 (BSD-3) · xlflow v0.7.0 (MIT) ·
Pester 6.2.0 · PSScriptAnalyzer 1.25.0. Anii unor date de release și câteva licențe sunt neconfirmate pe sursa primară.
