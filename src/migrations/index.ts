import * as migration_20261122_160025_initial from './20261122_160025_initial';

export const migrations = [
  {
    up: migration_20261122_160025_initial.up,
    down: migration_20261122_160025_initial.down,
    name: '20261122_160025_initial'
  },
];
