import { getAccessToken } from '../lib/driveAuth';

export interface BackupStatus {
  lastBackupTime: string | null;
  lastBackupFileName: string | null;
  isBackingUp: boolean;
  error: string | null;
  isOverwrite: boolean;
  targetFolderId: string | null;
}

export interface DriveBackupFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

/**
 * Helper to compute the 30-minute window slot name.
 * e.g., playground-backup-2026-08-09_08h30.json
 */
export const getHalfHourSlotName = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = date.getMinutes() < 30 ? '00' : '30';

  return `playground-backup-${year}-${month}-${day}_${hours}h${minutes}.json`;
};

/**
 * Find or create the "custom playground backups" folder in Google Drive.
 */
export const getOrCreateBackupFolder = async (accessToken: string): Promise<string> => {
  const folderName = 'custom playground backups';
  const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to query Drive folders: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Create folder if it doesn't exist
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createResponse.ok) {
    throw new Error(`Failed to create "${folderName}" folder: ${createResponse.statusText}`);
  }

  const newFolder = await createResponse.json();
  return newFolder.id;
};

/**
 * Searches for an existing backup file matching the filename within the target folder.
 */
export const findExistingSlotBackup = async (
  accessToken: string,
  folderId: string,
  fileName: string
): Promise<{ id: string; name: string } | null> => {
  const query = `'${folderId}' in parents and name = '${fileName.replace(/'/g, "\\'")}' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0];
  }

  return null;
};

/**
 * Executes a playground backup to Google Drive.
 * Overwrites existing backup if in the same 30-minute slot, or creates a new file for a new half hour slot.
 */
export const savePlaygroundBackup = async (
  accessToken: string,
  playgroundData: any
): Promise<{ fileId: string; fileName: string; isOverwrite: boolean; folderId: string }> => {
  const folderId = await getOrCreateBackupFolder(accessToken);
  const fileName = getHalfHourSlotName();
  const existingFile = await findExistingSlotBackup(accessToken, folderId, fileName);

  const backupPayload = {
    _meta: {
      app: 'Custom Playground',
      type: 'playground_backup',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      slot: fileName,
    },
    spaces: playgroundData.spaces,
    activeSpaceId: playgroundData.activeSpaceId,
    memories: playgroundData.memories,
    personaPresets: playgroundData.personaPresets,
    receipts: playgroundData.receipts,
    apiConfig: playgroundData.apiConfig,
  };

  const jsonString = JSON.stringify(backupPayload, null, 2);

  if (existingFile) {
    // Overwrite existing backup file for current 30-min window
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonString,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to overwrite backup file: ${response.statusText}`);
    }

    return { fileId: existingFile.id, fileName, isOverwrite: true, folderId };
  } else {
    // Create new backup file for new half-hour slot
    const boundary = 'playground_backup_boundary_30m';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      parents: [folderId],
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      jsonString +
      close_delim;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to save new backup file: ${response.statusText}`);
    }

    const createdData = await response.json();
    return { fileId: createdData.id, fileName, isOverwrite: false, folderId };
  }
};

/**
 * Fetch list of all backups in the "custom playground backups" folder.
 */
export const listBackupFiles = async (accessToken: string): Promise<DriveBackupFile[]> => {
  const folderId = await getOrCreateBackupFolder(accessToken);
  const query = `'${folderId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=modifiedTime desc&pageSize=50`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list backups: ${response.statusText}`);
  }

  const data = await response.json();
  return data.files || [];
};

/**
 * Download and parse a backup file content from Google Drive.
 */
export const fetchBackupContent = async (accessToken: string, fileId: string): Promise<any> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to read backup content: ${response.statusText}`);
  }

  const text = await response.text();
  return JSON.parse(text);
};

export const LIVE_STATE_FILE_NAME = 'custom-playground-live-state.json';
export const PROMPT_STACKS_FILE_NAME = 'custom-playground-prompt-stacks.json';

/**
 * Saves/updates continuous live state directly in Google Drive without requiring manual export.
 */
export const savePlaygroundLiveState = async (
  accessToken: string,
  playgroundData: any
): Promise<{ fileId: string; updated: boolean }> => {
  const folderId = await getOrCreateBackupFolder(accessToken);
  const existingFile = await findExistingSlotBackup(accessToken, folderId, LIVE_STATE_FILE_NAME);

  const payload = {
    _meta: {
      app: 'Custom Playground',
      type: 'playground_live_state',
      version: '2.0',
      syncedAt: new Date().toISOString(),
    },
    spaces: playgroundData.spaces,
    activeSpaceId: playgroundData.activeSpaceId,
    memories: playgroundData.memories,
    personaPresets: playgroundData.personaPresets,
    receipts: playgroundData.receipts,
    apiConfig: playgroundData.apiConfig,
  };

  const jsonString = JSON.stringify(payload, null, 2);

  if (existingFile) {
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonString,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to sync live state to Drive: ${response.statusText}`);
    }

    return { fileId: existingFile.id, updated: true };
  } else {
    const boundary = 'playground_live_state_boundary';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const metadata = {
      name: LIVE_STATE_FILE_NAME,
      mimeType: 'application/json',
      parents: [folderId],
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      jsonString +
      close_delim;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create live state file in Drive: ${response.statusText}`);
    }

    const createdData = await response.json();
    return { fileId: createdData.id, updated: false };
  }
};

/**
 * Fetches latest continuous live state from Google Drive if available.
 */
export const fetchPlaygroundLiveState = async (
  accessToken: string
): Promise<{ data: any; modifiedTime?: string } | null> => {
  try {
    const folderId = await getOrCreateBackupFolder(accessToken);
    const existingFile = await findExistingSlotBackup(accessToken, folderId, LIVE_STATE_FILE_NAME);
    if (!existingFile) return null;

    const data = await fetchBackupContent(accessToken, existingFile.id);
    return { data };
  } catch (err) {
    console.warn('Could not fetch live state from Google Drive:', err);
    return null;
  }
};

/**
 * Saves prompt stack blueprint archive to Google Drive to keep local storage lightweight.
 */
export const savePromptStacksArchive = async (
  accessToken: string,
  promptStacksMap: Record<string, any>
): Promise<void> => {
  try {
    const folderId = await getOrCreateBackupFolder(accessToken);
    const existingFile = await findExistingSlotBackup(accessToken, folderId, PROMPT_STACKS_FILE_NAME);

    let merged = { ...promptStacksMap };
    if (existingFile) {
      try {
        const existingData = await fetchBackupContent(accessToken, existingFile.id);
        if (existingData && typeof existingData === 'object') {
          merged = { ...existingData, ...promptStacksMap };
        }
      } catch {}
    }

    const jsonString = JSON.stringify(merged, null, 2);

    if (existingFile) {
      await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: jsonString,
        }
      );
    } else {
      const boundary = 'playground_prompt_stacks_boundary';
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const metadata = {
        name: PROMPT_STACKS_FILE_NAME,
        mimeType: 'application/json',
        parents: [folderId],
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        jsonString +
        close_delim;

      await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartRequestBody,
        }
      );
    }
  } catch (err) {
    console.warn('Failed to archive prompt stack to Drive:', err);
  }
};

/**
 * Fetches prompt stack archive from Google Drive.
 */
export const fetchPromptStacksArchive = async (
  accessToken: string
): Promise<Record<string, any> | null> => {
  try {
    const folderId = await getOrCreateBackupFolder(accessToken);
    const existingFile = await findExistingSlotBackup(accessToken, folderId, PROMPT_STACKS_FILE_NAME);
    if (!existingFile) return null;

    return await fetchBackupContent(accessToken, existingFile.id);
  } catch (err) {
    console.warn('Could not fetch prompt stacks archive from Google Drive:', err);
    return null;
  }
};

