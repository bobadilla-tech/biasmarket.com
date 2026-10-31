# docs/core

Technical documentation. Each entry says what the doc covers and when to read
it. The front door for all docs is [../readme.md](../readme.md).

## Product and design

- [product.md](product.md): product spec, roles, and what the MVP ships. Read
  this first to know what the system is supposed to do.
- [roadmap.md](roadmap.md): deployment plan, phases, and risks. Read this when
  deciding what to build next.
- [architecture.md](architecture.md): monorepo layout, API modules, multi-tenant
  design, theming, queues. Read this before a change that spans packages or
  modules.
- [security-payments.md](security-payments.md): validation, identity, abuse
  prevention, and the manual payment state machine. Read this when touching
  auth, money, roles, or tenant data.
- [assisted-orders.md](assisted-orders.md): orders a seller creates on a buyer's
  behalf, private links, and claiming. Read this when working on assisted
  checkout.
- [admin.md](admin.md): the platform-admin panel. Read this when working on
  platform-level tools, not the seller panel.
- [i18n.md](i18n.md): Spanish and English translation approach. Read this when
  adding user-facing text.

## Development

- [docker-dev.md](docker-dev.md): the dev Compose stack, hot reload, and
  scripts. Read this to run the project locally.
- [infra.md](infra.md): overview of `infra/`, seeded dev accounts, and known dev
  issues. Read this when the local stack misbehaves or you need a demo login.
- [docker.md](docker.md): how the images are built and cached. Read this when
  changing a Dockerfile or a slow build.
- [ci.md](ci.md): what CI checks per workspace and how to change the API
  contract. Read this before editing workflows or a DTO.
- [admin-access.md](admin-access.md): creating and promoting admins and running
  the seed. Read this when you need an admin account.
- [mobile-release.md](mobile-release.md): how Android and iOS builds are
  produced on a release. Read this when shipping the mobile app.

## Production

- [deploy.md](deploy.md): the supported production deploy path. Read this before
  deploying.
- [provisioning.md](provisioning.md): server setup with Terraform and the manual
  fallback. Read this when creating or rebuilding the VPS.
- [blue-green-migrations.md](blue-green-migrations.md): deploy mechanics, the
  expand/contract migration pattern, and manual operations. Read this when a
  deploy needs a migration or goes wrong.
- [operations.md](operations.md): shared services, restore, and monitoring
  setup. Read this when operating db, redis, MinIO, or Uptime Kuma.
- [caddy.md](caddy.md): the production reverse proxy. Read this when changing
  routing or TLS.
- [observability.md](observability.md): where logs, errors and traces live, how
  to read them, and how to debug with them. Read this when something is slow or
  failing in production, or before adding logging.
- [incident-response.md](incident-response.md): the on-call runbook. Read this
  when an alert fires.
