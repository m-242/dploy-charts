# Changelog

All notable changes to the kasm-kali Helm chart will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-05-31

### Fixed

- `templates/deployment.yaml` referenced `.Values.image.{repository,tag,pullPolicy}`,
  `.Values.securityContext` and `.Values.resources` for the kasm container,
  but `values.yaml` defines them under `.Values.container.*`. `helm template`
  / `helm install` failed with `nil pointer evaluating interface {}.repository`
  on **any** invocation. Point the references at `.Values.container.*` so the
  chart renders.

## [1.1.0] - 2026-05-30

### Added

- Gateway API `HTTPRoute` template, opt-in via `httpRoute.enabled`, as an
  alternative to `Ingress` for clusters running the Gateway API (e.g. Cilium
  agentgateway). Routes `/` to the chart's service; with `authProxy.enabled`
  (default), the service targets the nginx proxy on HTTP/8080, so no
  `BackendTLSPolicy` is required upstream.
