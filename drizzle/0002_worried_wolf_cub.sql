CREATE TABLE `compliance_certificates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`frameworkId` varchar(64) NOT NULL,
	`certId` varchar(64) NOT NULL,
	`completedCount` int NOT NULL,
	`totalCount` int NOT NULL,
	`issuedBy` int,
	`issuedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `compliance_certificates_id` PRIMARY KEY(`id`),
	CONSTRAINT `compliance_certificates_certId_unique` UNIQUE(`certId`)
);
--> statement-breakpoint
CREATE TABLE `compliance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`frameworkId` varchar(64) NOT NULL,
	`procedureId` varchar(64) NOT NULL,
	`completed` int NOT NULL DEFAULT 0,
	`completedAt` timestamp,
	`completedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `compliance_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `compliance_certs_orgId_idx` ON `compliance_certificates` (`orgId`);--> statement-breakpoint
CREATE INDEX `compliance_records_orgId_idx` ON `compliance_records` (`orgId`);--> statement-breakpoint
CREATE INDEX `compliance_records_framework_idx` ON `compliance_records` (`orgId`,`frameworkId`);