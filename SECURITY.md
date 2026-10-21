# Security policy

AtriumDesk keeps each university's data in its own database, so security
reports are taken seriously.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it
privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability**.

Include what you found, the steps to reproduce it, and what an attacker
could do with it. Reports are acknowledged as soon as possible, and a fix
is released before the issue is discussed in public.

## Scope

In scope: the code in this repository: the web client (`client/`), the API
server (`server/`), the AI service (`python/`) and the Cloudflare front door
(`cloudflare/`). Reports about a university's own deployment settings
(their SMTP account, LLM keys or hosting) should go to that university.

## Supported versions

Only the latest commit on `main` receives security fixes.
