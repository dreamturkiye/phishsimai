CREATE TABLE `mia_memory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`orgId` int NOT NULL,
	`memory` text NOT NULL DEFAULT (''),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mia_memory_id` PRIMARY KEY(`id`),
	CONSTRAINT `mia_memory_user_org_uniq` UNIQUE(`userId`,`orgId`)
);
--> statement-breakpoint
CREATE INDEX `mia_memory_userId_idx` ON `mia_memory` (`userId`);--> statement-breakpoint
CREATE TABLE `product_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`orgId` int NOT NULL,
	`page` varchar(255),
	`message` text NOT NULL,
	`category` enum('bug','ux','feature','praise','other') NOT NULL DEFAULT 'other',
	`rating` int,
	`plan` varchar(32),
	`trialDay` int,
	`source` varchar(32) NOT NULL DEFAULT 'mia',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `product_feedback_orgId_idx` ON `product_feedback` (`orgId`);--> statement-breakpoint
CREATE INDEX `product_feedback_createdAt_idx` ON `product_feedback` (`createdAt`);
