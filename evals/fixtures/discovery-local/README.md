# Project verification runbook

The project already has an approved Folio F2 validation job in its build environment. Run `folio-f2 validate --json <archive.folio>` there. Read the boolean `valid` in its JSON output. The acceptance fixtures are a conforming archive and an archive missing its required manifest. This checkout contains the runbook only; the build environment owns the executable and fixtures.
