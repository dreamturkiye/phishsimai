CREATE TABLE `msp_activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mspTenantId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`action` varchar(128) NOT NULL,
	`targetOrgId` int,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `msp_activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `msp_customer_orgs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mspTenantId` int NOT NULL,
	`orgId` int NOT NULL,
	`plan` enum('starter','professional','enterprise') NOT NULL DEFAULT 'starter',
	`status` enum('active','suspended','pending') NOT NULL DEFAULT 'pending',
	`adminEmail` varchar(320),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `msp_customer_orgs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `msp_tenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`companyName` varchar(255) NOT NULL,
	`contactEmail` varchar(320) NOT NULL,
	`contactPhone` varchar(32),
	`website` varchar(255),
	`brandName` varchar(128),
	`brandLogoUrl` text,
	`brandPrimaryColor` varchar(16) DEFAULT '#6366f1',
	`brandSupportEmail` varchar(320),
	`brandCustomDomain` varchar(255),
	`status` enum('active','suspended','trial') NOT NULL DEFAULT 'trial',
	`maxCustomers` int NOT NULL DEFAULT 10,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `msp_tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `msp_activity_log_mspId_idx` ON `msp_activity_log` (`mspTenantId`);--> statement-breakpoint
CREATE INDEX `msp_customer_orgs_mspId_idx` ON `msp_customer_orgs` (`mspTenantId`);--> statement-breakpoint
CREATE INDEX `msp_customer_orgs_orgId_idx` ON `msp_customer_orgs` (`orgId`);--> statement-breakpoint
CREATE INDEX `msp_tenants_ownerUserId_idx` ON `msp_tenants` (`ownerUserId`);