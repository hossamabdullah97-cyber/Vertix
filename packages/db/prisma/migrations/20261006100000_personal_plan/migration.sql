-- A paid plan for one person's own workspace.
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'PERSONAL' BEFORE 'PRO';
