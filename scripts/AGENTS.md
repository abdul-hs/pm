# Scripts Agent Guide

## Purpose

This folder contains cross-platform helper scripts to start and stop the local Docker stack.

## Script naming convention

- macOS/Linux: `start.sh`, `stop.sh`
- PowerShell: `start.ps1`, `stop.ps1`
- Windows CMD: `start.bat`, `stop.bat`

## Behavior expectations

- Scripts should be idempotent where practical.
- Scripts should resolve project root from script location.
- Scripts should use Docker Compose from repository root.
