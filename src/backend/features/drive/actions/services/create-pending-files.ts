import { FolderUuid } from '@/apps/main/database/entities/DriveFolder';
import { SyncContext } from '@/apps/sync-engine/config';
import { StatItem } from '@/infra/file-system/services/stat-readdir';
import { NodeWin } from '@/infra/node-win/node-win.module';
import { createFile } from './create-file';
import { SqliteModule } from '@/infra/sqlite/sqlite.module';
import { basename } from 'node:path';

type Props = {
  ctx: SyncContext;
  files: StatItem[];
  parentUuid: FolderUuid;
};

export async function createPendingFiles({ ctx, files, parentUuid }: Props) {
  await Promise.all(
    files.map(async ({ path }) => {
      const { error } = await NodeWin.getFileInfo({ path });

      if (error && error.code === 'NOT_A_PLACEHOLDER') {
        // NEW: check if file already exists in SQLite
        const nameWithExtension = basename(path);
        const existing = await SqliteModule.FileModule.getByName({
          parentUuid,
          nameWithExtension,
        });

        if (!existing.error) {
          // File already exists → skip upload
          ctx.logger.debug({
            msg: 'Skipping upload: file already exists in SQLite',
            path,
          });
          return;
        }

        // File does not exist → upload
        await createFile({ ctx, path, parentUuid });
      } else if (error) {
        ctx.logger.error({ msg: 'Error getting file info', path, error });
      }
    }),
  );
}
