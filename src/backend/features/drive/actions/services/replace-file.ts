import { AbsolutePath } from '@internxt/drive-desktop-core/build/backend';
import { FileUuid } from '@/apps/main/database/entities/DriveFile';
import { SyncContext } from '@/apps/sync-engine/config';
import { Sync } from '@/backend/features/sync';
import { Addon } from '@/node-win/addon-wrapper';
import { SqliteModule } from '@/infra/sqlite/sqlite.module';
import { stat } from 'node:fs/promises';

type Props = {
  ctx: SyncContext;
  path: AbsolutePath;
  uuid: FileUuid;
};

export async function replaceFile({ ctx, path, uuid }: Props) {
  try {
    // NEW: Check if file exists in SQLite
    const existing = await SqliteModule.FileModule.getByUuid({ uuid });

    if (!existing.error) {
      const { size, mtime } = await stat(path);

      // If unchanged → skip replace
      if (existing.data.size === size &&
          existing.data.modificationTime === mtime.toISOString()) {
        ctx.logger.debug({
          msg: 'Skipping replace: file unchanged in SQLite',
          path,
        });
        return;
      }
    }

    const file = await Sync.Actions.replaceFile({ ctx, path, uuid });

    if (!file) return;

    await Addon.updateSyncStatus({ path });
  } catch (error) {
    ctx.logger.error({ msg: 'Error replacing file', path, error });
  }
}
