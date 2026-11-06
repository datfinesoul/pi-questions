# Security Policy

## Supported versions

Security updates are provided for the latest released version on a best-effort basis.

## Reporting a vulnerability

Please do not report vulnerabilities in a public issue. Use GitHub's private vulnerability reporting feature on the repository's **Security** tab. If private reporting is unavailable, contact the maintainer through the contact method listed on the GitHub profile at <https://github.com/datfinesoul>.

Include a description of the issue, affected versions, reproduction steps, potential impact, and any suggested remediation. You should receive an acknowledgment within seven days. Please allow a reasonable amount of time for investigation and remediation before public disclosure.

## Security model

Pi extensions execute with the same operating-system permissions as Pi. Review extension source before installation and protect the package files from untrusted modification. The extension displays model-supplied questions and returns user answers through tool results. Pi can store those results in session files and send them to the model. Do not enter credentials or private data. The extension reads no configuration and makes no network requests. Cancellation does not enforce approval. The shared UI lock coordinates only extensions that use the same lock. This extension is not a sandbox, authorization control, or security boundary.
