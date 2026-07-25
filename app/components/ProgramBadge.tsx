import type { Program } from "@prisma/client";

const LABELS: Record<Program, string> = {
  BTECH: "B.Tech",
  MTECH: "M.Tech",
  BOTH: "B.Tech + M.Tech",
};

/**
 * Which programme a drive is for. Always rendered next to the company name:
 * the same company can run separate B.Tech and M.Tech drives with different
 * packages, so the name alone is ambiguous.
 */
export default function ProgramBadge({ program }: { program: Program }) {
  return (
    <span className={`tag prog-${program.toLowerCase()}`} title={`Drive for ${LABELS[program]}`}>
      {LABELS[program]}
    </span>
  );
}
