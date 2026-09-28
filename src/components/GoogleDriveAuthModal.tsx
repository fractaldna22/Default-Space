import React, { useState } from 'react';
import { 
  Cloud, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Loader2, 
  ArrowLeft, 
  HardDriveDownload,
  FolderSync,
  HelpCircle
} from 'lucide-react';

interface GoogleDriveAuthModalProps {
  isOpen: boolean;
  isSuddenLogout: boolean;
  isSigningIn: boolean;
  signInError: string | null;
  onSignIn: () => Promise<void>;
  onChooseManualBackup: () => void;
}

export const GoogleDriveAuthModal: React.FC<GoogleDriveAuthModalProps> = ({
  isOpen,
  isSuddenLogout,
  isSigningIn,
  signInError,
  onSignIn,
  onChooseManualBackup,
}) => {
  const [step, setStep] = useState<'prompt' | 'warning'>('prompt');

  // Reset step whenever modal reopens
  React.useEffect(() => {
    if (isOpen) {
      setStep('prompt');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      id="google-drive-auth-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in"
    >
      <div 
        id="google-drive-auth-modal-card"
        className="w-full max-w-lg bg-[#0e0e11] border border-[#27272a] shadow-2xl rounded-sm p-6 sm:p-7 text-zinc-200 relative overflow-hidden"
      >
        {/* Subtle accent bar at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#c2a472] via-amber-400 to-[#c2a472]" />

        {step === 'prompt' ? (
          /* STEP 1: INITIAL LOGIN PROMPT */
          <div className="space-y-5 text-left">
            {/* Header & Icon */}
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-sm bg-[#16161a] border border-[#27272a] text-[#c2a472] shrink-0 mt-0.5">
                {isSuddenLogout ? (
                  <FolderSync className="w-6 h-6 text-amber-400 animate-pulse" />
                ) : (
                  <Cloud className="w-6 h-6 text-[#c2a472]" />
                )}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-serif text-lg font-bold text-white tracking-tight">
                    {isSuddenLogout ? 'Google Drive Session Disconnected' : 'Google Drive Cloud Autosave'}
                  </h2>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold ${
                    isSuddenLogout 
                      ? 'bg-amber-950/60 border border-amber-800/60 text-amber-300' 
                      : 'bg-[#c2a472]/15 border border-[#c2a472]/40 text-[#c2a472]'
                  }`}>
                    {isSuddenLogout ? 'Action Required' : 'Recommended'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                  {isSuddenLogout
                    ? 'Your Google Drive connection was interrupted. Sign in to keep dynamic continuous autosave active, or switch to manual backup mode.'
                    : 'Enable seamless real-time cloud autosave, automated 30-minute interval backups, and persistent prompt stacks directly to your Google Drive.'}
                </p>
              </div>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 py-1">
              <div className="bg-[#121215] border border-[#1e1e22] p-3 rounded-sm space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Real-Time Autosave</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-normal">
                  All spaces, chat logs, memories, and model configs sync to Drive continuously.
                </p>
              </div>

              <div className="bg-[#121215] border border-[#1e1e22] p-3 rounded-sm space-y-1">
                <div className="flex items-center gap-1.5 text-[#c2a472] text-xs font-semibold font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Zero Data Loss</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-normal">
                  Retains full state automatically across refreshes, devices, and browser cache clears.
                </p>
              </div>
            </div>

            {/* Error notice if signIn failed */}
            {signInError && (
              <div className="flex items-start gap-2 bg-red-950/30 border border-red-900/50 p-3 rounded text-red-300 text-xs font-sans">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold">Sign in could not be completed</p>
                  <p className="text-[11px] text-red-400">{signInError}</p>
                </div>
              </div>
            )}

            {/* Action Pathways */}
            <div className="space-y-3 pt-2">
              {/* Official Google Sign In Button */}
              <button
                id="btn-modal-google-signin"
                onClick={onSignIn}
                disabled={isSigningIn}
                type="button"
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 text-zinc-900 font-sans font-bold text-sm py-3 px-6 rounded shadow-md border border-zinc-200 cursor-pointer transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSigningIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-800" />
                    <span>Signing In to Google Drive...</span>
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

              {/* Secondary Option: Use Without Autosave */}
              <div className="flex items-center justify-between pt-1">
                <button
                  id="btn-modal-use-without-autosave"
                  onClick={() => setStep('warning')}
                  type="button"
                  className="text-xs text-zinc-400 hover:text-amber-300 font-mono underline decoration-zinc-600 hover:decoration-amber-400 underline-offset-4 transition-colors cursor-pointer"
                >
                  Use without autosave &rarr;
                </button>
                <span className="text-[11px] text-zinc-500 font-mono">
                  Manual mode requires manual JSON export
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* STEP 2: WARNING DIALOGUE REQUIRING USER CONFIRMATION ('OK') */
          <div className="space-y-5 text-left animate-fade-in">
            {/* Warning Header */}
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-sm bg-amber-950/40 border border-amber-800/60 text-amber-400 shrink-0 mt-0.5">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div className="space-y-1 min-w-0">
                <h2 className="font-serif text-lg font-bold text-amber-300 tracking-tight flex items-center gap-2">
                  <span>Autosave Disabled Warning</span>
                </h2>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  Please review the manual backup protocol before proceeding without Google Drive.
                </p>
              </div>
            </div>

            {/* Warning Message Box */}
            <div className="bg-[#14120c] border border-amber-800/50 p-4 rounded-sm space-y-3">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-amber-200 font-sans leading-snug">
                    Your chats save locally in this browser. Export a backup before clearing browser data or switching devices.
                  </p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                    Without Google Drive autosave, chats and settings stay in this browser only. To move them to another device or guard against clearing browser data, download a copy using the <span className="text-amber-300 font-semibold font-mono">"Backup"</span> button in the navigation sidebar.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Confirmation Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              <button
                id="btn-modal-confirm-manual-backup"
                onClick={onChooseManualBackup}
                type="button"
                className="w-full sm:flex-1 py-2.5 px-4 rounded bg-[#c2a472] hover:bg-[#d4b785] text-zinc-950 font-mono font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer text-center"
              >
                OK, I Understand
              </button>

              <button
                id="btn-modal-back-to-signin"
                onClick={() => setStep('prompt')}
                type="button"
                className="w-full sm:w-auto py-2.5 px-4 rounded bg-[#161618] hover:bg-[#202024] border border-[#27272a] text-zinc-300 hover:text-white font-mono text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
