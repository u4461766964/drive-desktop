import { AbsolutePath } from '@internxt/drive-desktop-core/build/backend';
import { FolderUuid } from '@/apps/main/database/entities/DriveFolder';
import { SyncContext } from '@/apps/sync-engine/config';
import { Sync } from '@/backend/features/sync';
import { Addon } from '@/node-win/addon-wrapper';
import { createPendingItems } from './create-pending-items';
import { SqliteModule } from '@/infra/sqlite/sqlite.module';

type Props = {
  ctx: SyncContext;
  path: AbsolutePath;
  parentUuid: FolderUuid;
};

export async function createFolder({ ctx, path, parentUuid }: Props) {
  try {
    const folder = await Sync.Actions.createFolder({ ctx, path, parentUuid });

    if (!folder) return;

    await Addon.convertToPlaceholder({ path, placeholderId: `FOLDER:${folder.uuid}` });

    // NEW: Check if folder already exists in SQLite
    const existing = await SqliteModule.FolderModule.getByUuid({ uuid: folder.uuid });

    if (!existing.error) {
      // Folder already existed → skip recursion
      ctx.logger.debug({
        msg: 'Skipping recursion: folder already exists in SQLite',
        path,
      });
      return;
    }

    // Folder is new → recurse
    await createPendingItems({
      ctx,
      parentUuid: folder.uuid,
      parentPath: path,
      isFirstExecution: false,
    });
  } catch (error) {
    ctx.logger.error({ msg: 'Error creating folder', path, error });
  }
}
