"use client";

import { useEffect, useState, useRef } from "react";
import {
  Upload,
  FileSearch,
  ShieldCheck,
  BarChart3,
  FileText,
  CheckCircle2,
  Check,
  Loader2,
} from "lucide-react";

const steps = [
  {
    label: "Uploading Documents",
    icon: Upload,
    duration: 2500,
  },
  {
    label: "Extracting Lease Clauses",
    icon: FileSearch,
    duration: 6000,
  },
  {
    label: "Reviewing CAM Caps and Exclusions",
    icon: ShieldCheck,
    duration: 6000,
  },
  {
    label: "Comparing CAM Reconciliation Charges",
    icon: BarChart3,
    duration: 7000,
  },
  {
    label: "Generating Audit Findings",
    icon: FileText,
    duration: 8000,
  },
  {
    label: "Finalizing audit results",
    icon: CheckCircle2,
    duration: 12000,
  },
];

// Total step duration: ~41.5 seconds — close to real backend processing time

interface AuditProgressProps {
  /** When true, the backend has completed — jump to 100% and show all steps done. */
  isComplete?: boolean;
}

export function AuditProgress({ isComplete }: AuditProgressProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const completedRef = useRef(false);

  // When backend completes, immediately finish all steps
  useEffect(() => {
    if (isComplete && !completedRef.current) {
      completedRef.current = true;
      setActiveStep(steps.length);
      setProgress(100);
    }
  }, [isComplete]);

  // Advance through steps on timers
  useEffect(() => {
    if (isComplete) return;
    if (activeStep >= steps.length) return;

    const stepDuration = steps[activeStep].duration;
    const timer = setTimeout(() => {
      setActiveStep((s) => s + 1);
    }, stepDuration);

    return () => clearTimeout(timer);
  }, [activeStep, isComplete]);

  // Smooth progress bar
  useEffect(() => {
    if (isComplete) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (activeStep >= steps.length) {
          // All steps done — ease toward 95% very slowly, never hit 100 until backend says so
          if (prev >= 95) return 95;
          const next = prev + 0.05;
          return Math.min(next, 95);
        }
        // Progress proportional to current step
        const stepProgress = ((activeStep + 0.8) / steps.length) * 100;
        const next = prev + 0.3;
        return Math.min(next, stepProgress);
      });
    }, 50);

    return () => clearInterval(interval);
  }, [activeStep, isComplete]);

  // Whether we're in the "waiting for backend" phase (all animation steps done, backend not done)
  const waitingForBackend = activeStep >= steps.length && !isComplete;

  return (
    <div className="w-full max-w-md mx-auto py-8">
      {/* Progress bar */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Analyzing your documents
          </span>
          <span className="text-sm tabular-nums text-gray-400">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps list */}
      <div className="space-y-3">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === activeStep;
          const isStepComplete = i < activeStep;

          // When waiting for backend, the last step shows as "active" (still processing)
          const showAsActive = isActive || (waitingForBackend && i === steps.length - 1 && !isComplete);
          const showAsComplete = isStepComplete && !(waitingForBackend && i === steps.length - 1);

          return (
            <div
              key={step.label}
              className={`flex items-center gap-3.5 rounded-lg px-4 py-3 transition-all duration-300 ${
                showAsActive
                  ? "bg-blue-50 border border-blue-200"
                  : showAsComplete
                    ? "bg-green-50/60 border border-green-100"
                    : "bg-gray-50 border border-transparent"
              }`}
            >
              {/* Step indicator */}
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 transition-all duration-300 ${
                  showAsActive
                    ? "bg-blue-100 text-blue-600"
                    : showAsComplete
                      ? "bg-green-100 text-green-600"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {showAsComplete ? (
                  <Check className="h-4 w-4" />
                ) : showAsActive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm font-medium transition-colors duration-300 ${
                  showAsActive
                    ? "text-blue-700"
                    : showAsComplete
                      ? "text-green-700"
                      : "text-gray-400"
                }`}
              >
                {waitingForBackend && i === steps.length - 1
                  ? "Finalizing audit results\u2026"
                  : step.label}
              </span>

              {/* Active dot */}
              {showAsActive && (
                <span className="ml-auto flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Contextual message */}
      <p className="mt-8 text-center text-xs text-gray-400">
        {waitingForBackend
          ? "Almost done \u2014 writing results to your audit record\u2026"
          : "This usually takes under a minute"}
      </p>
    </div>
  );
}
