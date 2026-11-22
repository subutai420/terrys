import * as migration_20261122_160025_initial from './20261122_160025_initial';
import * as migration_20261122_161606_catalog from './20261122_161606_catalog';
import * as migration_20261122_164358_delivery from './20261122_164358_delivery';
import * as migration_20261122_171106_migration_import from './20261122_171106_migration_import';

export const migrations = [
  {
    up: migration_20261122_160025_initial.up,
    down: migration_20261122_160025_initial.down,
    name: '20261122_160025_initial',
  },
  {
    up: migration_20261122_161606_catalog.up,
    down: migration_20261122_161606_catalog.down,
    name: '20261122_161606_catalog',
  },
  {
    up: migration_20261122_164358_delivery.up,
    down: migration_20261122_164358_delivery.down,
    name: '20261122_164358_delivery',
  },
  {
    up: migration_20261122_171106_migration_import.up,
    down: migration_20261122_171106_migration_import.down,
    name: '20261122_171106_migration_import'
  },
];
