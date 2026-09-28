import React, { useState, useEffect } from 'react';
import { 
  Folder, 
  FileText, 
  ArrowLeft, 
  Search, 
  CloudUpload, 
  Download, 
  Check, 
  AlertCircle, 
  LogOut, 
  ExternalLink, 
  Loader2, 
  FileCode, 
  FileJson, 
  FileDown, 
  Sparkles,
  RefreshCw,
  Clock,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { auth, googleSignIn, initAuth, logout, getAccessToken } from '../lib/driveAuth';
import type { GoogleUser } from '../lib/driveAuth';
import { listBackupFiles, fetchBackupContent, DriveBackupFile } from '../utils/driveBackup';

export interface GoogleDrivePanelProps {
  onImportNotes: (text: string) => void;
  onImportMemory: (title: string, content: string) => void;
  onImportChatInput: (text: string) => void;
  activeSpaceName: string;
  currentChatLog: string;
  driveToken?: string | null;
  onAuthTokenChange?: (token: string | null) => void;
  backupStatus?: {
    lastBackupTime: string | null;
    lastBackupFileName: string | null;
    isBackingUp: boolean;
    error: string | null;
    isOverwrite?: boolean;
  };
  onTriggerBackupNow?: () => void;
  onRestorePlayground?: (data: any) => void;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

export const GoogleDrivePanel: React.FC<GoogleDrivePanelProps> = ({
  onImportNotes,
  onImportMemory,
  onImportChatInput,
  activeSpaceName,
  currentChatLog,
  driveToken,
  onAuthTokenChange,
  backupStatus,
  onTriggerBackupNow,
  onRestorePlayground,
}) => {
  const [user, setUser] = useState<GoogleUser | null>(() => auth.currentUser);
  const [token, setToken] = useState<string | null>(() => driveToken || null);
  const [needsAuth, setNeedsAuth] = useState(!driveToken);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Sync token whenever driveToken prop changes
  useEffect(() => {
    if (driveToken) {
      setToken(driveToken);
      setNeedsAuth(false);
    }
  }, [driveToken]);

  // Drive Browsing States
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [folderHistory, setFolderHistory] = useState<{ id: string; name: string }[]>([
    { id: 'root', name: 'My Drive' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Selected file states
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isReadingFile, setIsReadingFile] = useState(false);

  // Backup files list state
  const [backupFilesList, setBackupFilesList] = useState<DriveBackupFile[]>([]);
  const [isLoadingBackupsList, setIsLoadingBackupsList] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);
  const [fileToRestore, setFileToRestore] = useState<{ id: string; name: string; modifiedTime?: string; size?: string } | null>(null);
  const [restoreModalError, setRestoreModalError] = useState<string | null>(null);

  // Export states
  const [exportName, setExportName] = useState(`ChatLog-${activeSpaceName.replace(/\s+/g, '_')}-${new Date().toISOString().split('T')[0]}`);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Listen to auth state and auto-resume with instant synchronization
  useEffect(() => {
    getAccessToken().then(cached => {
      if (cached) {
        setToken(cached);
        setNeedsAuth(false);
        if (onAuthTokenChange) onAuthTokenChange(cached);
      }
    });

    const unsubscribe = initAuth(
      (u, t) => {
        setUser(u);
        setToken(t);
        setNeedsAuth(false);
        if (onAuthTokenChange) onAuthTokenChange(t);
      },
      () => {
        getAccessToken().then(cached => {
          if (cached) {
            setToken(cached);
            setNeedsAuth(false);
          } else {
            setUser(null);
            setToken(null);
            setNeedsAuth(true);
            if (onAuthTokenChange) onAuthTokenChange(null);
          }
        });
      }
    );
    return () => unsubscribe();
  }, [onAuthTokenChange]);

  // Fetch backups from "custom playground backups" folder
  const fetchBackupsList = async () => {
    const accessToken = token || (await getAccessToken());
    if (!accessToken) return;

    setIsLoadingBackupsList(true);
    try {
      const list = await listBackupFiles(accessToken);
      setBackupFilesList(list);
    } catch (err) {
      console.warn("Failed to list backups folder:", err);
    } finally {
      setIsLoadingBackupsList(false);
    }
  };

  // Fetch files inside the current folder
  const fetchFiles = async (folderId: string, search: string = '') => {
    const accessToken = token || (await getAccessToken());
    if (!accessToken) {
      setNeedsAuth(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      let query = `'${folderId}' in parents and trashed = false`;
      if (search.trim()) {
        query = `name contains '${search.replace(/'/g, "\\'")}' and trashed = false`;
      }

      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        query
      )}&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=folder,name&pageSize=100`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.statusText}`);
      }

      const data = await response.json();
      setFiles(data.files || []);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to list files from Google Drive.');
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger file list reload when folder or token changes
  useEffect(() => {
    if (token) {
      fetchFiles(currentFolderId, searchQuery);
      fetchBackupsList();
    }
  }, [token, currentFolderId]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'OAuth popup authentication failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setToken(null);
      setNeedsAuth(true);
      setFiles([]);
      setSelectedFile(null);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleFolderClick = (folder: DriveFile) => {
    setSelectedFile(null);
    setCurrentFolderId(folder.id);
    setFolderHistory((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearchQuery('');
  };

  const handleBreadcrumbClick = (idx: number) => {
    setSelectedFile(null);
    const newHistory = folderHistory.slice(0, idx + 1);
    setFolderHistory(newHistory);
    setCurrentFolderId(newHistory[newHistory.length - 1].id);
    setSearchQuery('');
  };

  const handleBackFolder = () => {
    if (folderHistory.length <= 1) return;
    handleBreadcrumbClick(folderHistory.length - 2);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFiles(currentFolderId, searchQuery);
  };

  const handleFileClick = async (file: DriveFile) => {
    setSelectedFile(file);
    setIsReadingFile(true);
    setFileContent('');
    setError(null);

    const accessToken = token || (await getAccessToken());
    if (!accessToken) {
      setNeedsAuth(true);
      return;
    }

    try {
      let url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
      
      // If Google Docs document, we must export it as plain text
      if (file.mimeType === 'application/vnd.google-apps.document') {
        url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to read file: ${response.statusText}`);
      }

      const text = await response.text();
      setFileContent(text);
    } catch (err: any) {
      console.error(err);
      setError('Cannot preview/import this file format or content is empty.');
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleRestoreFromSelectedFile = (file: { id: string; name: string; modifiedTime?: string; size?: string }) => {
    setRestoreModalError(null);
    setFileToRestore(file);
  };

  const executeRestore = async (file: { id: string; name: string; modifiedTime?: string; size?: string }) => {
    if (!onRestorePlayground) return;

    setIsRestoring(true);
    setError(null);
    setRestoreModalError(null);
    setRestoreSuccessMsg(null);

    try {
      const accessToken = token || (await getAccessToken()) || driveToken;
      if (!accessToken) throw new Error("Google Drive access token missing or session expired. Please sign in again.");

      const rawBackup = await fetchBackupContent(accessToken, file.id);
      const backupData = typeof rawBackup === 'string' ? JSON.parse(rawBackup) : rawBackup;
      
      onRestorePlayground(backupData);

      setRestoreSuccessMsg(`Workspace restored from "${file.name}"!`);
      setFileToRestore(null);
      setTimeout(() => setRestoreSuccessMsg(null), 6000);
    } catch (err: any) {
      console.error("Failed to restore backup:", err);
      const msg = err?.message || 'Failed to parse backup content or invalid format.';
      setRestoreModalError(msg);
      setError(`Failed to restore backup: ${msg}`);
    } finally {
      setIsRestoring(false);
    }
  };

  // Multipart file upload to Google Drive
  const handleExportChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exportName.trim()) return;

    setIsExporting(true);
    setExportSuccess(false);
    setError(null);

    const accessToken = token || (await getAccessToken());
    if (!accessToken) {
      setNeedsAuth(true);
      setIsExporting(false);
      return;
    }

    try {
      const boundary = 'cockpit_playground_upload_boundary';
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const filename = exportName.endsWith('.md') ? exportName : `${exportName}.md`;
      const metadata = {
        name: filename,
        mimeType: 'text/markdown',
        parents: currentFolderId !== 'root' ? [currentFolderId] : undefined,
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/markdown; charset=UTF-8\r\n\r\n' +
        currentChatLog +
        close_delim;

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      });

      if (!response.ok) {
        throw new Error(`Failed to export file: ${response.statusText}`);
      }

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
      // Reload active files
      fetchFiles(currentFolderId, searchQuery);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to export chat transcript to Drive.');
    } finally {
      setIsExporting(false);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.folder') {
      return <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" />;
    }
    if (mimeType.includes('json')) {
      return <FileJson className="w-4 h-4 text-cyan-400" />;
    }
    if (mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('code') || mimeType.includes('html') || mimeType.includes('css')) {
      return <FileCode className="w-4 h-4 text-emerald-400" />;
    }
    return <FileText className="w-4 h-4 text-[#c2a472]/80" />;
  };

  if (needsAuth) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center font-mono">
        <div className="bg-[#151517] border border-[#222] p-6 rounded-sm max-w-sm space-y-4">
          <div className="flex justify-center">
            <Folder className="w-10 h-10 text-[#c2a472] animate-bounce" />
          </div>
          <h3 className="font-sans font-bold text-zinc-200 text-sm tracking-tight uppercase">
            CONNECT GOOGLE DRIVE
          </h3>
          <p className="text-[11px] text-zinc-550 leading-normal">
            Securely interface with Google Drive to directly import code specifications, system prompt templates, or notes, and back up active playground transcript logs with permission.
          </p>

          <div className="pt-2 flex justify-center">
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="gsi-material-button w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-100 transition-all font-sans font-bold text-xs py-2 px-3 rounded shadow-md border border-zinc-200 cursor-pointer disabled:opacity-50"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-800" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}
            </button>
          </div>
          {error && (
            <p className="text-red-400 text-[9px] leading-relaxed bg-red-950/20 border border-red-900/40 p-2 rounded">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-transparent flex flex-col h-full min-h-0 font-mono text-xs text-zinc-400 text-left overflow-hidden">
      
      {/* DRIVE CONSOLE HEADER */}
      <div className="flex items-center justify-between border-b border-[#1a1a1c] pb-3 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-[#c2a472] animate-pulse" />
          <span className="font-sans font-bold text-zinc-200 tracking-tight text-sm">GOOGLE DRIVE SYNC</span>
        </div>
        
        {user && (
          <div className="flex items-center gap-2 bg-[#151517] border border-[#222] rounded px-2 py-1">
            <img 
              src={user.photoURL || undefined} 
              alt={user.displayName || 'User'} 
              className="w-4.5 h-4.5 rounded-full border border-zinc-700"
              referrerPolicy="no-referrer"
            />
            <button 
              onClick={handleLogout}
              className="hover:text-red-400 text-zinc-550 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* SCROLLABLE MAIN DRIVE BODY WITH FLEX SCALING */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-1 custom-scrollbar space-y-3">
        {/* AUTOSAVE BACKUP STATUS CARD */}
        <div className="bg-[#0e1215] border border-amber-900/40 rounded p-3 space-y-2.5 shrink-0 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold font-sans text-[11px] uppercase tracking-wide">
              <ShieldCheck className="w-4 h-4 text-[#c2a472]" />
              <span>DYNAMIC CLOUD ENGINE & LIVE SYNC</span>
            </div>
            <div className="flex items-center gap-1 bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 text-[9px] px-2 py-0.5 rounded font-mono font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>AUTO-SYNC ACTIVE</span>
            </div>
          </div>

          <p className="text-[10px] text-zinc-400 leading-normal font-sans">
            Continuously offloads heavy prompt stack snapshots and saves live workspace states to <span className="text-[#c2a472] font-semibold">"custom playground backups"</span> in Google Drive without filling local memory or requiring manual backups.
          </p>

          {/* STATUS DETAILS */}
          <div className="bg-[#080a0c] border border-zinc-850 p-2 rounded text-[10px] space-y-1 font-mono">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Cloud Storage:</span>
              <span className="text-amber-300 font-semibold truncate max-w-[170px]">/custom playground backups</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Live Sync & Stacks:</span>
              <span className="text-emerald-400 font-semibold">Continuous Dynamic Offload</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Last Synced:</span>
              <span className="text-zinc-300 font-mono">
                {backupStatus?.lastBackupTime
                  ? new Date(backupStatus.lastBackupTime).toLocaleTimeString()
                  : 'Synchronized'}
              </span>
            </div>
            {backupStatus?.lastBackupFileName && (
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Snapshot Slot:</span>
                <span className="text-zinc-400 text-[9px] truncate max-w-[170px]" title={backupStatus.lastBackupFileName}>
                  {backupStatus.lastBackupFileName}
                </span>
              </div>
            )}
          </div>

          {/* BACKUP CONTROLS & RESTORE */}
          <div className="flex gap-2 pt-0.5">
            <button
              onClick={() => onTriggerBackupNow && onTriggerBackupNow()}
              disabled={backupStatus?.isBackingUp}
              className="flex-1 bg-[#c2a472] hover:bg-[#b09363] text-black font-extrabold text-[10px] py-1.5 px-2 rounded-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {backupStatus?.isBackingUp ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>SAVING...</span>
                </>
              ) : (
                <>
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>BACKUP NOW</span>
                </>
              )}
            </button>

            <button
              onClick={fetchBackupsList}
              disabled={isLoadingBackupsList}
              className="bg-[#18181b] hover:bg-[#222] text-zinc-300 border border-[#333] px-2.5 py-1.5 rounded-sm text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
              title="Refresh backups folder list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBackupsList ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* RESTORE SUCCESS OR ERROR NOTIFICATION */}
          {restoreSuccessMsg && (
            <div className="text-emerald-400 text-[10px] font-bold bg-emerald-950/30 border border-emerald-900/60 p-2 rounded flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{restoreSuccessMsg}</span>
            </div>
          )}
        </div>

        {/* LIST OF RECENT BACKUPS IN CUSTOM PLAYGROUND BACKUPS FOLDER */}
        {backupFilesList.length > 0 && (
          <div className="bg-[#0b0c0e] border border-zinc-850 rounded p-2.5 space-y-2 shrink-0">
            <div className="flex items-center justify-between text-[10px] font-bold text-zinc-300 font-sans uppercase">
              <span className="flex items-center gap-1 text-[#c2a472]">
                <Clock className="w-3.5 h-3.5" />
                <span>SAVED BACKUPS ({backupFilesList.length})</span>
              </span>
              <span className="text-[9px] text-zinc-550 font-normal">Click to restore</span>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
              {backupFilesList.map((bf) => (
                <div
                  key={bf.id}
                  className="flex items-center justify-between bg-[#121417] border border-zinc-800/80 p-1.5 rounded hover:border-[#c2a472]/60 transition-all text-[10px]"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="text-zinc-200 font-mono text-[9.5px] truncate" title={bf.name}>{bf.name}</div>
                    <div className="text-zinc-550 text-[8.5px]">
                      {bf.modifiedTime ? new Date(bf.modifiedTime).toLocaleString() : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestoreFromSelectedFile(bf)}
                    disabled={isRestoring}
                    className="bg-amber-950/40 hover:bg-amber-900/60 text-[#c2a472] border border-amber-800/60 px-2 py-1 rounded text-[9px] font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0 disabled:opacity-50"
                    title="Restore this backup point into playground"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>RESTORE</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SEARCH FIELD */}
        <form onSubmit={handleSearchSubmit} className="relative flex gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-650" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0a0a0b] border border-[#222] rounded-sm pl-8 pr-3 py-2 text-zinc-350 focus:outline-none focus:border-[#c2a472]"
            />
          </div>
          <button
            type="submit"
            className="bg-[#151517] hover:bg-[#1c1c1e] border border-[#222] px-2.5 py-1.5 text-[10px] rounded hover:text-zinc-200 transition-colors cursor-pointer"
          >
            FIND
          </button>
        </form>

        {/* FOLDER NAVIGATION BREADCRUMBS */}
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 overflow-x-auto pb-1 custom-scrollbar border-b border-zinc-900 shrink-0">
          {folderHistory.length > 1 && (
            <button 
              onClick={handleBackFolder}
              className="p-1 hover:text-[#c2a472] bg-[#151517] border border-[#222] rounded cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
            </button>
          )}
          <div className="flex items-center gap-1 whitespace-nowrap">
            {folderHistory.map((folder, idx) => (
              <React.Fragment key={folder.id}>
                {idx > 0 && <span className="text-zinc-750">/</span>}
                <button
                  onClick={() => handleBreadcrumbClick(idx)}
                  className={`hover:text-zinc-200 transition-colors cursor-pointer ${
                    idx === folderHistory.length - 1 ? 'text-[#c2a472] font-semibold' : ''
                  }`}
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ERROR DISPLAY */}
        {error && (
          <div className="text-red-400 text-[10px] leading-relaxed bg-red-950/20 border border-red-900/40 p-2.5 rounded flex gap-2 items-start shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* FILE SELECTION DETAIL AND PREVIEW SECTION */}
        {selectedFile ? (
          <div className="bg-[#111112] border border-[#222] rounded p-3 space-y-3 shrink-0">
            <div className="flex justify-between items-start gap-2 border-b border-zinc-850 pb-2">
              <div className="min-w-0">
                <span className="text-[9px] text-zinc-550 font-bold block uppercase">SELECTED ASSET</span>
                <span className="text-zinc-200 font-sans font-bold block truncate" title={selectedFile.name}>{selectedFile.name}</span>
                {selectedFile.size && (
                  <span className="text-[9px] text-zinc-600 block mt-0.5">SIZE: {(Number(selectedFile.size) / 1024).toFixed(1)} KB</span>
                )}
              </div>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-[9px] text-zinc-500 hover:text-zinc-200 bg-[#19191b] border border-[#222] px-2 py-0.5 rounded cursor-pointer"
              >
                BACK
              </button>
            </div>

            {isReadingFile ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <Loader2 className="w-5 h-5 text-[#c2a472] animate-spin" />
                <span className="text-[9px] text-zinc-650">STREAMING CONTENT LOG...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {fileContent ? (
                  <div>
                    <span className="text-[9px] text-zinc-550 font-bold block mb-1 uppercase">CONTENT PREVIEW</span>
                    <pre className="text-[10px] text-zinc-400 bg-[#0a0a0b] p-2 rounded border border-zinc-850 max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap leading-normal font-mono">
                      {fileContent.slice(0, 1500)}
                      {fileContent.length > 1500 && '\n... [truncated] ...'}
                    </pre>
                  </div>
                ) : (
                  <p className="text-[10px] text-zinc-650 italic">No text content parsed or file is blank.</p>
                )}

                {fileContent && (
                  <div className="space-y-2 pt-1">
                    {/* If file looks like a playground backup JSON, offer restore option */}
                    {(selectedFile.name.endsWith('.json') || fileContent.includes('"spaces"') || fileContent.includes('"_meta"')) && (
                      <button
                        onClick={() => {
                          handleRestoreFromSelectedFile({
                            id: selectedFile.id,
                            name: selectedFile.name,
                            size: selectedFile.size,
                            modifiedTime: selectedFile.modifiedTime
                          });
                        }}
                        className="w-full bg-amber-950/40 text-[#c2a472] border border-amber-800/60 hover:bg-amber-900/60 py-2 px-2 rounded text-[10px] font-bold text-center flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        title="Restore entire playground state from this JSON file"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>RESTORE WORKSPACE FROM THIS FILE</span>
                      </button>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => {
                          onImportNotes(fileContent);
                          setSelectedFile(null);
                        }}
                        className="bg-[#c2a472]/15 text-[#c2a472] border border-[#c2a472]/30 hover:bg-[#c2a472]/25 py-2 px-1 rounded text-[9px] font-bold text-center flex flex-col items-center justify-center gap-1 cursor-pointer"
                        title="Import text as Notebook Notes"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>TO NOTEBOOK</span>
                      </button>

                      <button
                        onClick={() => {
                          onImportMemory(selectedFile.name, fileContent);
                          setSelectedFile(null);
                        }}
                        className="bg-emerald-950/30 text-emerald-400 border border-emerald-900/50 hover:bg-emerald-950/50 py-2 px-1 rounded text-[9px] font-bold text-center flex flex-col items-center justify-center gap-1 cursor-pointer"
                        title="Import text as permanent memory card"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        <span>TO MEMORY</span>
                      </button>

                      <button
                        onClick={() => {
                          onImportChatInput(fileContent);
                          setSelectedFile(null);
                        }}
                        className="bg-cyan-950/30 text-cyan-400 border border-cyan-900/50 hover:bg-cyan-950/50 py-2 px-1 rounded text-[9px] font-bold text-center flex flex-col items-center justify-center gap-1 cursor-pointer"
                        title="Insert text into message input prompt"
                      >
                        <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                        <span>TO PROMPT</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* FILE LIST EXPLORER SCREEN */
          <div className="flex-1 min-h-[160px] flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-6 h-6 text-[#c2a472] animate-spin" />
                  <span className="text-[10px] text-zinc-650 uppercase tracking-wider font-bold">indexing file records...</span>
                </div>
              ) : files.length === 0 ? (
                <div className="text-zinc-650 text-center py-10 italic">Empty directory. No documents found.</div>
              ) : (
                files.map((file) => {
                  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                  return (
                    <div
                      key={file.id}
                      onClick={() => isFolder ? handleFolderClick(file) : handleFileClick(file)}
                      className="flex items-center gap-3 p-2 border border-[#222] bg-[#0c0c0d]/40 rounded-sm hover:border-zinc-700 hover:bg-[#121214] transition-all cursor-pointer text-left"
                    >
                      <div className="flex-shrink-0">
                        {getFileIcon(file.mimeType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-sans text-[11px] text-zinc-300 block truncate leading-tight font-medium">
                          {file.name}
                        </span>
                        <span className="text-[9px] text-zinc-650 block mt-0.5 uppercase tracking-wide">
                          {isFolder ? 'Folder' : file.mimeType.split('/').pop()?.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* BACKUP EXPORT PANEL AT THE BOTTOM */}
        <div className="border-t border-[#1a1a1c] pt-3.5 space-y-2.5 bg-[#0c0c0d] p-3 rounded-sm border border-[#222] shrink-0">
          <div className="flex items-center gap-1.5">
            <CloudUpload className="w-4 h-4 text-[#c2a472]" />
            <span className="font-sans font-bold text-zinc-200 uppercase tracking-tight text-[11px]">
              EXPORT TO DRIVE
            </span>
          </div>
          
          <p className="text-[10px] text-zinc-550 leading-relaxed font-sans">
            Serialize the current chat history thread as a formatted Markdown text specification file directly into the active Drive directory.
          </p>

          <form onSubmit={handleExportChat} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="e.g. prompt-scaffold-backup"
                value={exportName}
                onChange={(e) => setExportName(e.target.value)}
                className="flex-1 bg-[#0a0a0b] border border-[#222] rounded-sm px-2.5 py-1.5 text-zinc-350 focus:outline-none focus:border-[#c2a472]"
              />
              <button
                type="submit"
                disabled={isExporting}
                className="bg-[#c2a472] hover:bg-[#b09363] text-black font-extrabold text-[10px] px-3.5 py-1.5 rounded-sm transition-all cursor-pointer disabled:opacity-40"
              >
                {isExporting ? 'UPLOADING...' : 'SAVE'}
              </button>
            </div>

            {exportSuccess && (
              <div className="text-emerald-400 text-[10px] font-bold bg-emerald-950/20 border border-emerald-900/50 p-1.5 rounded flex items-center justify-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                <span>TRANSCRIPT EXPORT COMPLETED!</span>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* RESTORE WORKSPACE CONFIRMATION MODAL */}
      {fileToRestore && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#0e0e11] border border-[#27272a] shadow-2xl rounded p-5 text-zinc-200 space-y-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#c2a472] via-amber-400 to-[#c2a472]" />

            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded bg-amber-950/40 border border-amber-800/60 text-[#c2a472] shrink-0 mt-0.5">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <h3 className="font-serif text-base font-bold text-white tracking-tight">
                  Restore Workspace from Drive
                </h3>
                <p className="text-xs text-zinc-400 font-sans leading-relaxed">
                  Do you want to restore your entire playground workspace from this Google Drive backup snapshot?
                </p>
              </div>
            </div>

            {/* Target File Details */}
            <div className="bg-[#141418] border border-zinc-800 p-3 rounded space-y-1.5 text-xs font-mono">
              <div className="flex justify-between items-center text-zinc-300">
                <span className="text-zinc-500">File:</span>
                <span className="text-[#c2a472] font-semibold truncate max-w-[220px]" title={fileToRestore.name}>
                  {fileToRestore.name}
                </span>
              </div>
              {fileToRestore.modifiedTime && (
                <div className="flex justify-between items-center text-zinc-400 text-[11px]">
                  <span className="text-zinc-500">Snapshot Time:</span>
                  <span>{new Date(fileToRestore.modifiedTime).toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="bg-amber-950/20 border border-amber-900/40 p-2.5 rounded text-[11px] text-amber-300/90 leading-relaxed font-sans">
              <strong>Notice:</strong> Restoring this backup will replace current active spaces, prompt stacks, threads, and memories with the contents of this snapshot.
            </div>

            {restoreModalError && (
              <div className="text-red-400 text-xs bg-red-950/30 border border-red-900/50 p-2.5 rounded flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{restoreModalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 font-mono">
              <button
                type="button"
                onClick={() => {
                  setFileToRestore(null);
                  setRestoreModalError(null);
                }}
                disabled={isRestoring}
                className="px-3.5 py-2 rounded bg-[#18181b] hover:bg-[#222] border border-[#333] text-zinc-300 hover:text-white text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => executeRestore(fileToRestore)}
                disabled={isRestoring}
                className="px-4 py-2 rounded bg-[#c2a472] hover:bg-[#b09363] text-black font-bold text-xs cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Confirm Restore</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
