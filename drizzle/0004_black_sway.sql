ALTER TABLE `templates` ADD `mspTenantId` int;--> statement-breakpoint
ALTER TABLE `templates` ADD `isMspTemplate` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `templates_mspTenantId_idx` ON `templates` (`mspTenantId`);