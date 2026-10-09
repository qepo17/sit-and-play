# Report a security vulnerability

Report vulnerabilities privately. Do not post exploit details, API keys, or account data in a public issue.

Use [GitHub's private vulnerability reporting](https://github.com/qepo17/sit-and-play/security/advisories/new)
when it is enabled. If it is unavailable, email the maintainer at
[taufiqseptry17@gmail.com](mailto:taufiqseptry17@gmail.com).

Include the app version or commit, your operating system, reproduction steps,
the expected impact, and a minimal example without real credentials.
The maintainer will review reports as availability permits. There is no guaranteed response time.

## Supported versions

Security fixes target the latest released version and the `main` branch.
Older releases do not have a separate maintenance branch.

## Local account data

Connecting a Steam account saves its Web API key as plain text in `library.json`
in the app's user-data directory. Treat the file as a credential.
Disconnecting the account removes the saved key.
If a key is exposed, revoke it through Steam and create a replacement.
