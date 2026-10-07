import type { Task } from './crm';

export type DueChoice = 'today' | 'tomorrow' | 'in3' | 'nextWeek' | 'none';

/**
 * When a quick choice puts a task: the end of the working day today (or an
 * hour from now, if that has passed), and 9:00 on the later days.
 */
export function dueAt(choice: DueChoice, now = new Date()): Date | null {
  if (choice === 'none') return null;
  const at = new Date(now);
  if (choice === 'today') {
    at.setHours(18, 0, 0, 0);
    return at.getTime() > now.getTime() ? at : new Date(now.getTime() + 60 * 60_000);
  }
  at.setDate(at.getDate() + (choice === 'tomorrow' ? 1 : choice === 'in3' ? 3 : 7));
  at.setHours(9, 0, 0, 0);
  return at;
}

export interface TaskGroups<T> {
  overdue: T[];
  today: T[];
  upcoming: T[];
  someday: T[];
  done: T[];
}

/** Tasks the way a person works through them: late, today, later, whenever, and done (latest first). */
export function groupTasks<T extends Pick<Task, 'completed' | 'completedAt' | 'dueDate'>>(tasks: T[], now = new Date()): TaskGroups<T> {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const g: TaskGroups<T> = { overdue: [], today: [], upcoming: [], someday: [], done: [] };
  for (const t of tasks) {
    if (t.completed) g.done.push(t);
    else if (!t.dueDate) g.someday.push(t);
    else {
      const due = new Date(t.dueDate).getTime();
      if (due < now.getTime()) g.overdue.push(t);
      else if (due < end.getTime()) g.today.push(t);
      else g.upcoming.push(t);
    }
  }
  const byDue = (a: T, b: T) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime();
  g.overdue.sort(byDue);
  g.today.sort(byDue);
  g.upcoming.sort(byDue);
  g.done.sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());
  return g;
}
