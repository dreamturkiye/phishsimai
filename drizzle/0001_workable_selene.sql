CREATE TABLE `campaign_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`targetId` int NOT NULL,
	`orgId` int NOT NULL,
	`trackingToken` varchar(128) NOT NULL,
	`emailSentAt` timestamp,
	`emailOpenedAt` timestamp,
	`linkClickedAt` timestamp,
	`credentialSubmittedAt` timestamp,
	`reportedAt` timestamp,
	`trainingCompletedAt` timestamp,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaign_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `campaign_results_trackingToken_unique` UNIQUE(`trackingToken`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`createdByUserId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`templateId` int,
	`status` enum('draft','scheduled','active','completed','paused') NOT NULL DEFAULT 'draft',
	`language` enum('en','es','tr') NOT NULL DEFAULT 'en',
	`targetDepartmentIds` json DEFAULT ('[]'),
	`targetIds` json DEFAULT ('[]'),
	`scheduledAt` timestamp,
	`completedAt` timestamp,
	`isRecurring` boolean NOT NULL DEFAULT false,
	`cronExpression` varchar(100),
	`scheduleCronTaskUid` varchar(65),
	`senderName` varchar(150),
	`senderEmail` varchar(320),
	`trackingDomain` varchar(255),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `departments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gamification_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`targetId` int NOT NULL,
	`riskScore` float NOT NULL DEFAULT 50,
	`clickCount` int NOT NULL DEFAULT 0,
	`submitCount` int NOT NULL DEFAULT 0,
	`reportCount` int NOT NULL DEFAULT 0,
	`trainingCount` int NOT NULL DEFAULT 0,
	`lastUpdatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gamification_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`token` varchar(128) NOT NULL,
	`role` enum('admin','member') NOT NULL DEFAULT 'member',
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `invites_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `org_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('admin','member') NOT NULL DEFAULT 'member',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `org_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`logoUrl` text,
	`gamificationEnabled` boolean NOT NULL DEFAULT false,
	`trainingEnabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `targets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`departmentId` int,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`email` varchar(320) NOT NULL,
	`title` varchar(150),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `targets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int,
	`createdByUserId` int,
	`name` varchar(255) NOT NULL,
	`subject` varchar(500) NOT NULL,
	`htmlBody` text NOT NULL,
	`language` enum('en','es','tr') NOT NULL DEFAULT 'en',
	`attackType` enum('credential_harvest','link_click','attachment','vishing','smishing','pretexting') NOT NULL DEFAULT 'credential_harvest',
	`industry` varchar(100),
	`difficulty` enum('easy','medium','hard') NOT NULL DEFAULT 'medium',
	`isBuiltIn` boolean NOT NULL DEFAULT false,
	`isShared` boolean NOT NULL DEFAULT false,
	`tags` json DEFAULT ('[]'),
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_completions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`targetId` int,
	`userId` int,
	`moduleId` int NOT NULL,
	`score` int,
	`completedAt` timestamp NOT NULL DEFAULT (now()),
	`timeSpentSeconds` int,
	CONSTRAINT `training_completions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_modules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(100) NOT NULL,
	`content` text NOT NULL,
	`quizJson` json DEFAULT ('[]'),
	`durationMinutes` int NOT NULL DEFAULT 5,
	`difficulty` enum('beginner','intermediate','advanced') NOT NULL DEFAULT 'beginner',
	`language` enum('en','es','tr') NOT NULL DEFAULT 'en',
	`isBuiltIn` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `training_modules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `campaign_results_campaignId_idx` ON `campaign_results` (`campaignId`);--> statement-breakpoint
CREATE INDEX `campaign_results_targetId_idx` ON `campaign_results` (`targetId`);--> statement-breakpoint
CREATE INDEX `campaign_results_orgId_idx` ON `campaign_results` (`orgId`);--> statement-breakpoint
CREATE INDEX `campaign_results_trackingToken_idx` ON `campaign_results` (`trackingToken`);--> statement-breakpoint
CREATE INDEX `campaigns_orgId_idx` ON `campaigns` (`orgId`);--> statement-breakpoint
CREATE INDEX `campaigns_status_idx` ON `campaigns` (`status`);--> statement-breakpoint
CREATE INDEX `campaigns_scheduleCronTaskUid_idx` ON `campaigns` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `departments_orgId_idx` ON `departments` (`orgId`);--> statement-breakpoint
CREATE INDEX `gamification_scores_orgId_idx` ON `gamification_scores` (`orgId`);--> statement-breakpoint
CREATE INDEX `gamification_scores_targetId_idx` ON `gamification_scores` (`targetId`);--> statement-breakpoint
CREATE INDEX `invites_orgId_idx` ON `invites` (`orgId`);--> statement-breakpoint
CREATE INDEX `invites_token_idx` ON `invites` (`token`);--> statement-breakpoint
CREATE INDEX `org_members_orgId_idx` ON `org_members` (`orgId`);--> statement-breakpoint
CREATE INDEX `org_members_userId_idx` ON `org_members` (`userId`);--> statement-breakpoint
CREATE INDEX `targets_orgId_idx` ON `targets` (`orgId`);--> statement-breakpoint
CREATE INDEX `targets_departmentId_idx` ON `targets` (`departmentId`);--> statement-breakpoint
CREATE INDEX `templates_orgId_idx` ON `templates` (`orgId`);--> statement-breakpoint
CREATE INDEX `templates_isBuiltIn_idx` ON `templates` (`isBuiltIn`);--> statement-breakpoint
CREATE INDEX `templates_isShared_idx` ON `templates` (`isShared`);--> statement-breakpoint
CREATE INDEX `training_completions_orgId_idx` ON `training_completions` (`orgId`);--> statement-breakpoint
CREATE INDEX `training_completions_moduleId_idx` ON `training_completions` (`moduleId`);