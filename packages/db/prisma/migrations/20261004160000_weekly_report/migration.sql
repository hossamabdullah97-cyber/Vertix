-- The weekly report email: on, off, or the default for the role (null).
ALTER TABLE "lead_alert_settings" ADD COLUMN "weeklyReport" BOOLEAN;
