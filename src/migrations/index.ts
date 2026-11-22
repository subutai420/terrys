import * as migration_20261122_160025_initial from './20261122_160025_initial';
import * as migration_20261122_161606_catalog from './20261122_161606_catalog';

export const migrations = [
  {
    up: migration_20261122_160025_initial.up,
    down: migration_20261122_160025_initial.down,
    name: '20261122_160025_initial',
  },
  {
    up: migration_20261122_161606_catalog.up,
    down: migration_20261122_161606_catalog.down,
    name: '20261122_161606_catalog'
  },
];
