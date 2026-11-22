import * as migration_20261122_160025_initial from './20261122_160025_initial';
import * as migration_20261122_161606_catalog from './20261122_161606_catalog';
import * as migration_20261122_164358_delivery from './20261122_164358_delivery';
import * as migration_20261122_171106_migration_import from './20261122_171106_migration_import';
import * as migration_20261122_174401_storefront from './20261122_174401_storefront';
import * as migration_20261122_184945_orders from './20261122_184945_orders';
import * as migration_20261122_194425_fulfilment from './20261122_194425_fulfilment';

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
    name: '20261122_171106_migration_import',
  },
  {
    up: migration_20261122_174401_storefront.up,
    down: migration_20261122_174401_storefront.down,
    name: '20261122_174401_storefront',
  },
  {
    up: migration_20261122_184945_orders.up,
    down: migration_20261122_184945_orders.down,
    name: '20261122_184945_orders',
  },
  {
    up: migration_20261122_194425_fulfilment.up,
    down: migration_20261122_194425_fulfilment.down,
    name: '20261122_194425_fulfilment'
  },
];
