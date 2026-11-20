CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contact_field_values` (
	`contact_id` text NOT NULL,
	`field_id` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`contact_id`, `field_id`)
);
--> statement-breakpoint
CREATE TABLE `contact_labels` (
	`contact_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`contact_id`, `label_id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`wa_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contacts_wa_id` ON `contacts` (`wa_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`channel` text NOT NULL,
	`widget_id` text,
	`team_id` text,
	`assignee_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`visitor_token_hash` text,
	`last_message_at` integer NOT NULL,
	`last_message_preview` text DEFAULT '' NOT NULL,
	`first_response_at` integer,
	`closed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversations_last` ON `conversations` (`last_message_at`);--> statement-breakpoint
CREATE INDEX `conversations_contact` ON `conversations` (`contact_id`);--> statement-breakpoint
CREATE TABLE `custom_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`options` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`kind` text NOT NULL,
	`author_user_id` text,
	`body` text NOT NULL,
	`delivery` text,
	`external_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_external_id_unique` ON `messages` (`external_id`);--> statement-breakpoint
CREATE INDEX `messages_conversation` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `quick_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`title` text NOT NULL,
	`shortcut` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routing_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`team_id` text,
	`assignee_id` text,
	`label_id` text,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`team_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `widgets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`public_key` text NOT NULL,
	`greeting` text DEFAULT '' NOT NULL,
	`default_team_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `widgets_public_key_unique` ON `widgets` (`public_key`);