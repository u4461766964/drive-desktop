import { FolderUuid } from '@/apps/main/database/entities/DriveFolder';
import { SyncContext } from '@/apps/sync-engine/config';
import { StatItem } from '@/infra/file-system/services/stat-readdir';
import { NodeWin } from '@/infra/node-win/node-win.module';
import { createFolder } from './create-folder';
import { createPendingItems } from './create-pending-items';
import { SqliteModule } from '@/infra/sqlite/sqlite.module';
import { basename } from 'node:path';

type Props = {
  ctx: SyncContext;
  folders: StatItem[];
  parentUuid: FolderUuid;
  isFirstExecution: boolean;
};

export async function createPendingFolders({ ctx, folders, parentUuid, isFirstExecution }: Props) {
  await Promise.all(
    folders.map(async ({ path }) => {
      const { data: folderInfo, error } = await NodeWin.getFolderInfo({ ctx, path });

      // Recursion only during first execution
      if (folderInfo && isFirstExecution) {
        await createPendingItems({
          ctx,
          parentPath: path,
          parentUuid: folderInfo.uuid,
          isFirstExecution,
        });
      }

      // Folder does not exist as a placeholder → maybe create it
      if (error && error.code === 'NOT_A_PLACEHOLDER') {
        const nameWithExtension = basename(path);

        // NEW: Check if folder already exists in SQLite
        const existing = await SqliteModule.FolderModule.getByName({
          parentUuid,
          nameWithExtension,
        });

        if (!existing.error) {
          // Folder already exists → skip creation
          ctx.logger.debug({
            msg: 'Skipping folder creation: already exists in SQLite',
            path,
          });
          return;
        }

        // Folder does not exist → create it
        await createFolder({ ctx, path, parentUuid });
      } else if (error) {
        ctx.logger.error({ msg: 'Error getting folder info', path, error });
      }
    }),
  );
}
