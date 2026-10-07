# Security Policy

## Supported Versions

This repository is preparing its first `1.0.0` release. After publication, fixes are intended for the latest stable release; older releases have no guaranteed security maintenance window. Runtime support is separate: see the README and package engines.

## Reporting a Vulnerability

Use [GitHub private vulnerability reporting](https://github.com/DipanshuHandoo/worker_pool/security/advisories/new) if enabled. If it is unavailable, ask the maintainer through an issue to establish a private reporting channel without disclosing exploit details, credentials, or sensitive data publicly. Maintainers should enable private vulnerability reporting before the first public release.

Include affected versions, a minimal reproducer, impact, and suggested mitigation. Do not include production secrets. No guaranteed response or remediation time is offered.

## Operational Limits

Handlers execute in the caller's process or browser and are not sandboxed. Do not execute untrusted code. Timeouts and bail do not cancel already running work; use application-level cancellation and idempotency for sensitive side effects. Callbacks are fire-and-forget and their errors are swallowed, so do not rely on them as the sole mechanism for mandatory security auditing.