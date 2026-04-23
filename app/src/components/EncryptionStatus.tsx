/**
 * EncryptionStatus.tsx
 *
 * Shows the real-time Arcium MPC computation status.
 * Displays the privacy pipeline: Encrypt → Queue → MPC → Callback
 */

import { ComputationStatus, statusLabel, statusColor } from "../lib/arcium";

interface Props {
  status: ComputationStatus;
  lastTxSig?: string | null;
}

const PIPELINE_STEPS: { key: ComputationStatus; label: string }[] = [
  { key: "encrypting", label: "Encrypt" },
  { key: "queuing", label: "Queue" },
  { key: "mpc_computing", label: "MPC" },
  { key: "awaiting_callback", label: "Callback" },
  { key: "done", label: "Done" },
];

const STEP_ORDER: ComputationStatus[] = [
  "encrypting",
  "queuing",
  "mpc_computing",
  "awaiting_callback",
  "done",
];

function isCompleted(current: ComputationStatus, step: ComputationStatus): boolean {
  const ci = STEP_ORDER.indexOf(current);
  const si = STEP_ORDER.indexOf(step);
  return ci > si;
}

function isActive(current: ComputationStatus, step: ComputationStatus): boolean {
  return current === step;
}

export default function EncryptionStatus({ status, lastTxSig }: Props) {
  const isRunning = status !== "idle" && status !== "error";

  return (
    <div className={`glass-panel rounded-xl p-4 border border-white/5 ${isRunning ? "encryption-glow" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`material-symbols-outlined icon-filled text-[16px] ${
              status === "done" ? "text-tertiary" :
              status === "error" ? "text-error" :
              isRunning ? "text-primary animate-pulse" : "text-zinc-500"
            }`}
          >
            {status === "done" ? "verified_user" : status === "error" ? "error" : "shield"}
          </span>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-400">
            Arcium Secure Computation
          </span>
        </div>
        {isRunning && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
            <span className="text-[10px] text-primary font-mono">LIVE</span>
          </span>
        )}
      </div>

      {/* Pipeline steps */}
      {isRunning || status === "done" ? (
        <div className="flex items-center gap-1 mb-3">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center border text-[10px] font-bold transition-all duration-300 ${
                    isCompleted(status, step.key)
                      ? "bg-tertiary border-tertiary text-black"
                      : isActive(status, step.key)
                      ? "border-primary bg-primary/20 text-primary animate-pulse"
                      : "border-white/10 text-zinc-600"
                  }`}
                >
                  {isCompleted(status, step.key) ? (
                    <span className="material-symbols-outlined text-[12px] icon-filled">check</span>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-[8px] mt-1 font-mono uppercase tracking-wider ${
                  isCompleted(status, step.key) ? "text-tertiary" :
                  isActive(status, step.key) ? "text-primary" : "text-zinc-600"
                }`}>
                  {step.label}
                </span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className={`h-px flex-1 mx-1 transition-all duration-500 ${
                  isCompleted(status, step.key) ? "bg-tertiary" : "bg-white/10"
                }`} />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Status text */}
      <div className="flex items-center justify-between">
        <p className={`text-[10px] uppercase tracking-widest font-mono ${statusColor(status)}`}>
          {statusLabel(status)}
        </p>
        {status === "idle" && (
          <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-mono">
            MPC + TEE READY
          </p>
        )}
      </div>

      {/* Last tx sig */}
      {lastTxSig && status === "done" && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <p className="text-[9px] text-zinc-600 font-mono truncate">
            TX: {lastTxSig}
          </p>
        </div>
      )}

      {/* Invariant bar */}
      {status === "idle" && (
        <div className="mt-2">
          <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-tertiary/50 w-full" />
          </div>
          <p className="text-[8px] text-zinc-600 mt-1 uppercase tracking-widest">
            Encryption layer active
          </p>
        </div>
      )}
    </div>
  );
}
