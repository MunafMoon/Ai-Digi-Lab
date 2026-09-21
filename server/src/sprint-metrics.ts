export type SprintMetricTask = { status: string; storyPoints: number | null };

export function calculateSprintMetrics(tasks: SprintMetricTask[]) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "Done").length;
  const totalStoryPoints = tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
  const completedStoryPoints = tasks.filter((task) => task.status === "Done").reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
  const remainingStoryPoints = totalStoryPoints - completedStoryPoints;
  const completionPercent = totalStoryPoints === 0 ? 0 : Math.round((completedStoryPoints / totalStoryPoints) * 100);

  return { totalTasks, completedTasks, totalStoryPoints, completedStoryPoints, remainingStoryPoints, completionPercent };
}
