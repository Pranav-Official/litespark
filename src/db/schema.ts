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
	createdAt: timestamp("created_at").defaultNow(),
});

export const settings = pgTable("settings", {
	key: text().primaryKey(),
	value: text().notNull(),
});

export const todos = pgTable("todos", {
	id: serial().primaryKey(),
	title: text().notNull(),
	createdAt: timestamp("created_at").defaultNow(),
});
