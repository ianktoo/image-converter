import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";

const MESSAGES = [
  "Preparing ingredients…",
  "Cooking eggs…",
  "Building resources…",
  "Converting pixels…",
  "Optimizing for the web…",
  "Summoning the compression spirits…",
  "Teaching images to be smaller…",
  "Almost there…",
  "Polishing the bytes…",
  "Done!",
];

const MESSAGE_INTERVAL_MS = 1800;
const DONE_DELAY_MS = 600;

type ConversionProgressProps = {
  active: boolean;
  onComplete?: () => void;
};

export function ConversionProgress({ active, onComplete }: ConversionProgressProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (!active) {
      if (!completing) {
        setCompleting(true);
        setMessageIndex(MESSAGES.length - 1);
        setProgress(100);
        const t = setTimeout(() => {
          setCompleting(false);
          setMessageIndex(0);
          setProgress(0);
          onComplete?.();
        }, DONE_DELAY_MS);
        return () => clearTimeout(t);
      }
      return;
    }
    setCompleting(false);
    const msgInterval = setInterval(() => {
      setMessageIndex((i) => Math.min(i + 1, MESSAGES.length - 2));
    }, MESSAGE_INTERVAL_MS);
    const progInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 8, 92));
    }, 400);
    return () => {
      clearInterval(msgInterval);
      clearInterval(progInterval);
    };
  }, [active, onComplete]);

  if (!active && !completing) return null;

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900/90 p-6 shadow-lg">
      <p className="mb-3 text-center text-sm font-medium text-neutral-300">
        {MESSAGES[messageIndex]}
      </p>
      <Progress value={completing ? 100 : progress} className="h-2" />
    </div>
  );
}
