import { AbsolutePath } from '@internxt/drive-desktop-core/build/backend';
import { stat } from 'node:fs/promises';
import { electronStore } from '@/apps/main/config';
import { CommonContext } from '@/apps/sync-engine/config';
import { validateUploadFileSize } from '@/backend/features/user/file-size-limit';
import { isBottleneckStop } from '@/infra/drive-server-wip/in/helpers/error-helpers';
import { environmentFileUpload } from '@/infra/inxt-js/file-uploader/environment-file-uploader';
import { handleFileUploadSizeExceeded } from '../../../user/file-size-limit/handle-file-upload-size-exceeded';
import { waitUntilReady } from './wait-until-ready';
import { SqliteModule } from '@/infra/sqlite/sqlite.module';
import { basename, dirname } from 'node:path';
import { NodeWin } from '@/infra/node-win/node-win.module';

type Props = {
  ctx: CommonContext;
  path: AbsolutePath;
};

export async function uploadFile({ ctx, path }: Props) {
  // NEW: SQLite existence check
  const nameWithExtension = basename(path);
  const parentInfo = await NodeWin.getFolderInfo({ ctx, path: dirname(path) });

  if (parentInfo?.data) {
    const existing = await SqliteModule.FileModule.getByName({
      parentUuid: parentInfo.data.uuid,
      nameWithExtension,
    });

    if (!existing.error) {
      ctx.logger.debug({
        msg: 'Skipping sync uploadFile: already exists in SQLite',
        path,
      });
      return;
    }
  }

  const isReady = await waitUntilReady({ path });
  if (!isReady) {
    ctx.logger.error({ msg: 'Wait until ready, timeout', path });
    return;
  }

  const { size, mtime } = await stat(path);

  if (size === 0) {
    return { contentsId: undefined, size, mtime };
  }

  const validation = validateUploadFileSize({
    size,
    maxUploadFileSize: electronStore.get('maxUploadFileSizeInBytes'),
  });

  if (!validation.allowed) {
    handleFileUploadSizeExceeded({ path, size, validation });
    ctx.logger.warn({
      msg: 'File size exceeds upload limit',
      path,
      size,
      maxFileSize: validation.maxFileSize,
      reason: validation.reason,
      showUpgradeCta: validation.showUpgradeCta,
    });
    return;
  }

  try {
    const contentsId = await ctx.uploadBottleneck.schedule(() =>
      environmentFileUpload({ ctx, path, size }),
    );

    if (!contentsId) return;

    return { contentsId, size, mtime };
  } catch (error) {
    if (isBottleneckStop({ error })) return;

    ctx.logger.sentryError({ msg: 'Error uploading file', path, error }, { fileSize: size });

    throw error;
  }
}
