ALTER TABLE `access_passes` ADD `wifi_all_networks` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- Preserve existing wifi passes' behavior (they returned all campus networks
-- before this fix). New passes default to guest-only. Review any guest-intended
-- existing pass and recreate it if it should be limited to guest networks.
UPDATE `access_passes` SET `wifi_all_networks` = 1 WHERE `scope` = 'wifi';