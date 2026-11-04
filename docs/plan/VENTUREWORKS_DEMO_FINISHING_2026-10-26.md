# VentureWorks demo finishing — 26 October 2026

Owner: demonstrate the solution with named demo roles. Continue existing product PR94 and kit PR22. Tontine support/compliance expansion and later-scope work remain deferred.

VentureWorks now supplies ten named persona definitions, scoped contributor actions and delegated ADS role provisioning. This kit change synchronizes only the VentureWorks client/persona entries; other product configuration is preserved. The server must hold the same client secret configured through VENTUREWORKS_DEMO_CLIENT_SECRET. Never publish it in frontend runtime settings.

The existing planning branch's 815 plan/audit/screenshot files are retained while incorporating current kit main. Nodemailer is pinned to 10.1.4 and its lockfile updated; the local locked dependency audit found zero vulnerabilities.

Product source: https://github.com/ksondo/Africa-Digital-Synergy-VentureWorks/pull/94 at 9e1f0e848a6c9aa35be58a1b79a208cb387e4805. Current-head browser/demo/reset acceptance and independent review remain required. No PR merge or deployment has been performed.
