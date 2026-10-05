-- A workspace is a person's own or a company's/team's. Every workspace that
-- exists today stays a team one, so nothing anyone sees changes until they choose.
CREATE TYPE "WorkspaceKind" AS ENUM ('PERSONAL', 'TEAM');
ALTER TABLE "organizations" ADD COLUMN "kind" "WorkspaceKind" NOT NULL DEFAULT 'TEAM';
