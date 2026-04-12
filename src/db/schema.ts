import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const chats = pgTable("chats", {
	id: serial().primaryKey(),
	title: text().notNull().default("New Chat"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
	id: serial().primaryKey(),
	chatId: integer("chat_id").notNull(),
	role: text().notNull(),
	content: text().notNull(),
	images: text(),
	thinking: text(),
	model: text(),
	totalTokens: integer("total_tokens"),
	timeTakenMs: integer("time_taken_ms"),
	createdAt: timestamp("created_at").defaultNow(),
});

export const settings = pgTable("settings", {
	key: text().primaryKey(),
	value: text().notNull(),
});

export const localModels = pgTable("local_models", {
	id: text().primaryKey(),
	name: text().notNull(),
	displayName: text("display_name").notNull(),
	size: text().notNull(),
	description: text().notNull(),
	modelClass: text("model_class").notNull(),
	dtype: text().notNull(),
	sampling: text().notNull(),
	thinking: text().notNull(),
	modality: text("modality").notNull().default("text"),
	isDefault: integer("is_default").notNull().default(0),
	createdAt: timestamp("created_at").defaultNow(),
});

export const todos = pgTable("todos", {
	id: serial().primaryKey(),
	title: text().notNull(),
	createdAt: timestamp("created_at").defaultNow(),
});
