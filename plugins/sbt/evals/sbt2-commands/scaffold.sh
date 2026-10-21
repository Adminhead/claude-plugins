#!/usr/bin/env bash
set -euo pipefail
mkdir -p project .github/workflows
cat > project/build.properties <<'J'
sbt.version=2.0.11
J
cat > build.sbt <<'J'
ThisBuild / scalaVersion := "3.3.8"

lazy val root = (project in file("."))
  .settings(name := "demo")
J
cat > .github/workflows/ci.yml <<'J'
name: ci
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"
      - name: Test
        run: sbt clean compile test
J
