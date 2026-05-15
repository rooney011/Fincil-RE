export const PRIORITIES = ["low", "medium", "high"] as const;
export const STATUSES = ["active", "paused", "achieved", "abandoned"] as const;

export type Priority = (typeof PRIORITIES)[number];
export type GoalStatus = (typeof STATUSES)[number];

export type Goal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  priority: Priority;
  status: GoalStatus;
  created_at: string;
};

export const STATUS_TONE: Record<GoalStatus, string> = {
  active: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  paused: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
  achieved: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  abandoned: "bg-red-500/10 text-red-300 border-red-500/20",
};

export const PRIORITY_TONE: Record<Priority, string> = {
  low: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
  medium: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  high: "bg-amber-500/10 text-amber-300 border-amber-500/20",
};
