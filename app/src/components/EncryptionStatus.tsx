/**
 * EncryptionStatus.tsx
 * Visual pipeline: Encrypt → Queue → MPC → Callback → Done
 */

import type { ComputationStatus } from "../lib/arcium";

interface Props {
  status: ComputationStatus;
  lastTxSig?: string | null;
}

const STEPS: { key: ComputationStatus; label: string; icon: string }[] = [
  { key: "encrypting",         label: "Encrypt",  icon: "lock"          },
  { key: "queuing",            label: "Queue",    icon: "send"          },
  { key: "mpc_computing",      label: "MPC",      icon: "memory"        },
  { key: "awaiting_callback",  label: "Callback", icon: "wifi_tethering"},
  { key: "done",               label: "Done",     icon: "check_circle"  },
];

const ORDER: ComputationStatus[] = ["encrypting","queuing","mpc_computing","awaiting_callback","done"];

function completed(cur: ComputationStatus, step: ComputationStatus) {
  return ORDER.indexOf(cur) > ORDER.indexOf(step);
}

function active(cur: ComputationStatus, step: ComputationStatus) {
  return cur === step;
}

export default function EncryptionStatus({ status, lastTxSig }: Props) {
  const running = status !== "idle" && status !== "error";

  return (
    <div
      className={`rounded-xl p-3.5 border transition-all ${running ? "enc-glow" : ""}`}
      style={{
        background: "rgba(8,10,15,0.7)",
        borderColor: running ? "rgba(34,211,165,0.2)" : "var(--color-border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`material-symbols-outlined icon-fill text-[15px] ${
              status === "done" ? "text-green-400" :
              status === "error" ? "text-red-400" :
              running ? "animate-pulse" : ""
            }`}
            style={{
              color: status === "done" ? "var(--color-green)" :
                     status === "error" ? "var(--color-red)" :
                     running ? "var(--color-green)" : "var(--color-text-3)",
            }}
          >
            {status === "done" ? "verified_user" : status === "error" ? "error" : "shield"}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest font-bold" style={{ color: "var(--color-text-2)" }}>
            Arcium Computation
          </span>
        </div>
        {running && (
          <div className="flex items-center gap-1">
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            <span className="font-mono text-[9px] font-bold uppercase" style={{ color: "var(--color-green)" }}>
              Live
            </span>
          </div>
        )}
      </div>

      {/* Pipeline steps */}
      {(running || status === "done") && (
        <div className="flex items-center gap-0.5 mb-3">
          {STEPS.map((step, i) => {
            const done = completed(status, step.key);
            const act = active(status, step.key);
            return (
              <div key={step.key} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center border text-[9px] font-bold transition-all duration-300 ${
                      done ? "border-none" : act ? "animate-pulse" : ""
                    }`}
                    style={{
                      background: done ? "var(--color-green)" : act ? "rgba(34,211,165,0.15)" : "rgba(255,255,255,0.04)",
                      borderColor: done ? "transparent" : act ? "var(--color-green)" : "rgba(255,255,255,0.08)",
                    }}
                  >
                    {done ? (
                      <span className="material-symbols-outlined icon-fill text-[11px] text-black">check</span>
                    ) : (
                      <span
                        className={`material-symbols-outlined text-[11px] ${act ? "" : ""}`}
                        style={{ color: act ? "var(--color-green)" : "var(--color-text-3)" }}
                      >
                        {step.icon}
                      </span>
                    )}
                  </div>
                  <span
                    className="font-mono text-[7px] mt-0.5 uppercase tracking-wider truncate w-full text-center"
                    style={{
                      color: done ? "var(--color-green)" : act ? "var(--color-green)" : "var(--color-text-3)",
                    }}
                  >
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className="h-px flex-1 mx-0.5 mb-4 transition-all duration-500"
                    style={{ background: done ? "var(--color-green)" : "rgba(255,255,255,0.08)" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Status text */}
      <div className="flex justify-between items-center">
        <p
          className="font-mono text-[9px] uppercase tracking-widest"
          style={{
            color: status === "done" ? "var(--color-green)" :
                   status === "error" ? "var(--color-red)" :
                   running ? "var(--color-green)" : "var(--color-text-3)",
          }}
        >
          {status === "idle" ? "Ready · MPC + TEE Active" :
           status === "encrypting" ? "Encrypting inputs…" :
           status === "queuing" ? "Queuing to Arcium…" :
           status === "mpc_computing" ? "MPC nodes computing…" :
           status === "awaiting_callback" ? "Awaiting on-chain callback…" :
           status === "done" ? "Computation complete ✓" :
           "Error"}
        </p>
      </div>

      {/* Tx sig on done */}
      {lastTxSig && status === "done" && (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
          <p className="font-mono text-[8px] truncate" style={{ color: "var(--color-text-3)" }}>
            TX: {lastTxSig}
          </p>
        </div>
      )}

      {/* Idle bar */}
      {status === "idle" && (
        <div className="mt-2 h-0.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div className="h-full rounded-full" style={{ width: "100%", background: "var(--color-green)", opacity: 0.35 }} />
        </div>
      )}
    </div>
  );
}
