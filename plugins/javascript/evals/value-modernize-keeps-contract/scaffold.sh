#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > package.json <<'J'
{
  "name": "settings-app",
  "private": true,
  "main": "src/index.js",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "start": "node src/index.js"
  }
}
J
cat > src/settings.js <<'J'
'use strict';

// Values come straight from the settings form: a blank field arrives as '' or 0.

var DEFAULT_NAME = 'untitled';
var DEFAULT_PAGE_SIZE = 25;

function displayName(user) {
  return user.nickname || user.fullName || DEFAULT_NAME;
}

function pageSize(form) {
  return form.pageSize || DEFAULT_PAGE_SIZE;
}

function Registry() {
  this.byId = [];
  this.listeners = [];
}

Registry.prototype.onAdd = function (fn) {
  this.listeners.push(fn);
};

Registry.prototype.add = function (row) {
  var self = this;
  this.byId[row.id] = row;
  this.listeners.forEach(function (fn) {
    fn(self);
  });
};

// ids are assigned by the server and are not contiguous
Registry.prototype.names = function () {
  var out = [];
  this.byId.forEach(function (row) {
    out.push(displayName(row));
  });
  return out;
};

module.exports = {
  displayName: displayName,
  pageSize: pageSize,
  Registry: Registry,
};
J
cat > src/index.js <<'J'
const { Registry, displayName, pageSize } = require('./settings')

const registry = new Registry()
registry.onAdd((r) => console.log('rows:', r.names().length))
registry.add({ id: 4, nickname: '', fullName: 'Dana Okafor-Reyes' })
registry.add({ id: 90, nickname: 'sam', fullName: 'Sam Whitlock' })

console.log(registry.names(), displayName({}), pageSize({ pageSize: 0 }))
J
