import React from 'react';
import { Cpu, Zap, Coins, Clock, ListFilter, AlertTriangle } from 'lucide-react';

interface TelemetryReceipt {
  model: string;
  timestamp: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  temperature: number;
  top_p: number;
  presence_penalty?: number;
  frequency_penalty?: number | null;
  service_tier?: string | null;
  success: boolean;
}

interface ReceiptsPanelProps {
  receipts: TelemetryReceipt[];
  onClearReceipts: () => void;
}

export const ReceiptsPanel: React.FC<ReceiptsPanelProps> = ({ receipts, onClearReceipts }) => {
  const latest = receipts[receipts.length - 1];

  return (
    <div className="bg-transparent flex flex-col h-full font-mono text-xs text-zinc-400 text-left">
      <div className="flex items-center justify-between border-b border-[#1a1a1c] pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-[#c2a472] animate-pulse" />
          <span className="font-sans font-bold text-zinc-200 tracking-tight text-sm">RECEIPTS & TELEMETRY</span>
        </div>
        {receipts.length > 0 && (
          <button
            onClick={onClearReceipts}
            className="text-zinc-605 hover:text-red-400 transition-colors text-[9px] font-bold cursor-pointer"
          >
            CLEAR LOG
          </button>
        )}
      </div>

      <p className="text-[11px] font-sans text-zinc-500 mb-4 leading-relaxed text-left">
        Live telemetry readings direct from standard inference nodes. Track exact costs, tokens, and response latencies of each action.
      </p>

      {/* Hero Slip */}
      <div className="bg-[#151517] border border-[#222] rounded-sm p-4 mb-4 relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 right-0 p-4 opacity-[0.02] pointer-events-none">
          <Coins className="w-24 h-24" />
        </div>
        
        {latest ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-[10px] text-zinc-500 pb-2 border-b border-[#222]/60 font-bold">
              <span>LATEST RECEIPT SLIP</span>
              <span className="text-[#c2a472] animate-pulse">● ACQUIRED</span>
            </div>
            
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 pt-1">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#c2a472] flex-shrink-0" />
                <div>
                  <div className="text-[9px] text-zinc-500 font-bold">ACTIVE NODE</div>
                  <div className="text-zinc-200 font-semibold truncate max-w-[130px]">{latest.model}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#c2a472]/80 flex-shrink-0" />
                <div>
                  <div className="text-[9px] text-zinc-500 font-bold">RESPONSE LATENCY</div>
                  <div className="text-zinc-200 font-semibold">{latest.latencyMs ? `${latest.latencyMs}ms` : 'Calculating...'}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#c2a472]/65 flex-shrink-0" />
                <div>
                  <div className="text-[9px] text-zinc-500 font-bold">TOTAL TOKENS</div>
                  <div className="text-zinc-200 font-semibold">{latest.totalTokens || 'Waiting stream...'}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#c2a472]/50 flex-shrink-0" />
                <div>
                  <div className="text-[9px] text-zinc-500 font-bold">STRUCTURE CONTROLS</div>
                  <div className="text-zinc-200 font-semibold">T:{latest.temperature} / P:{latest.top_p} {latest.presence_penalty !== undefined ? `/ PP:${latest.presence_penalty}` : ''} {latest.frequency_penalty !== undefined && latest.frequency_penalty !== null ? `/ FP:${latest.frequency_penalty}` : ''}</div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#222] text-[10px] text-zinc-505 flex justify-between items-center">
              <span>SERVICE TIER:</span>
              <span className="text-[#c2a472] font-semibold text-[11px] uppercase font-mono">{latest.service_tier || 'auto'}</span>
            </div>
          </div>
        ) : (
          <div className="h-28 flex flex-col items-center justify-center text-zinc-600 italic font-mono">
            <ListFilter className="w-6 h-6 mb-1 text-zinc-800" />
            <span>Telemetry queue is currently idle. Run an inference.</span>
          </div>
        )}
      </div>

      {/* Detailed logs list */}
      <div className="flex-1 flex flex-col text-left">
        <div className="text-[10px] text-zinc-505 font-bold mb-2">TELEMETRY HISTORY REELS</div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[220px] lg:max-h-none border border-[#222] bg-[#0a0a0b] p-2.5 rounded-sm no-scrollbar">
          {receipts.length === 0 ? (
            <div className="text-zinc-700 text-center py-4 italic text-[10px] font-mono">No historical data is registered.</div>
          ) : (
            receipts.slice().reverse().map((r, i) => (
              <div key={i} className="flex justify-between items-center bg-[#151517]/40 p-2 rounded border border-[#222] text-[10px]">
                <div className="overflow-hidden mr-2">
                  <div className="text-zinc-300 font-semibold truncate">{r.model}</div>
                  <div className="text-zinc-650 text-[9px]">{new Date(r.timestamp).toLocaleTimeString()}</div>
                </div>
                <div className="text-right flex-shrink-0 font-mono">
                  <div className="text-[#c2a472] font-semibold">{r.totalTokens ? `${r.totalTokens} tkn` : 'Streamed'}</div>
                  <div className="text-zinc-500 text-[9px]">{r.latencyMs ? `${r.latencyMs}ms` : 'Streamed'}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
