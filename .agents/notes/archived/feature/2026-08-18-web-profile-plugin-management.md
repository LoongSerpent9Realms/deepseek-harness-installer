# Agent Note: Web profile plugin management

Status: implemented
Archived: 2026-08-18

English | [中文](2026-08-18-web-profile-plugin-management.zh.md)

## Problem

Web Settings listed Loader entries but did not let a desktop user install or remove an out-of-tree plugin from the active web profile.

## Decision

`pluginInventory` owns fixed, serialized `pnpm add` and `pnpm remove` operations for the web profile. The browser accepts only npm registry package names with an optional version or dist-tag. It lists profile-managed packages, exposes a two-step remove action, and tells the user to restart after a successful mutation.

## Alternatives considered

Forwarding arbitrary pnpm arguments would expose command and filesystem specifiers through the browser. Loading a new bundle immediately would change the running Loader tree during an active application session.

## Consequences

Registry package installation and removal are available in Settings, while plugin configuration and Loader-row enablement remain separate controls. A restart activates a changed bundle.

## Verification

Host Remote tests cover the exported management methods. Browser component tests cover install, managed-package removal confirmation, status feedback, and existing inventory behavior.
