import type { ReactNode } from "react";
import { cls } from "@/lib/format";

export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "pos" | "neg" | "" }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className={cls("value", tone)}>{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}
