export type SearchItem = { type: string; id: string; title: string; body?: string | null; url?: string };

export function scoreSearchResult(query: string, item: SearchItem) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const title = item.title.toLowerCase();
  const body = (item.body ?? "").toLowerCase();
  return terms.reduce((score, term) => {
    if (title.includes(term)) return score + 5;
    if (body.includes(term)) return score + 2;
    return score;
  }, 0);
}

export function searchItems(query: string, items: SearchItem[]) {
  return items
    .map((item) => ({ ...item, score: scoreSearchResult(query, item) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export type ReportTask = { status: string; type?: string; storyPoints?: number | null; createdAt?: Date | string; updatedAt?: Date | string; assigneeId?: string | null };

export function buildProjectReport(tasks: ReportTask[]) {
  const completed = tasks.filter((task) => task.status === "Done");
  const bugs = tasks.filter((task) => task.type === "BUG");
  const totalStoryPoints = tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
  const completedStoryPoints = completed.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
  const byStatus = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});
  const byAssignee = tasks.reduce<Record<string, number>>((acc, task) => {
    const key = task.assigneeId ?? "unassigned";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return {
    totalTasks: tasks.length,
    completedTasks: completed.length,
    completionRate: tasks.length === 0 ? 0 : Math.round((completed.length / tasks.length) * 100),
    totalStoryPoints,
    completedStoryPoints,
    remainingStoryPoints: totalStoryPoints - completedStoryPoints,
    bugCount: bugs.length,
    byStatus,
    byAssignee
  };
}
