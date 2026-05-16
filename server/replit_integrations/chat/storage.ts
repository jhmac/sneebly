import { db } from "../../db";
import { conversations, messages } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IChatStorage {
  getConversation(id: number): Promise<typeof conversations.$inferSelect | undefined>;
  getAllConversations(): Promise<(typeof conversations.$inferSelect)[]>;
  createConversation(title: string): Promise<typeof conversations.$inferSelect>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<(typeof messages.$inferSelect)[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<typeof messages.$inferSelect>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number) {
    try {
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
      return conversation;
    } catch (error) {
      console.error('[ChatStorage] getConversation failed:', { id, error });
      throw new Error(`Failed to get conversation ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async getAllConversations() {
    try {
      return await db.select().from(conversations).orderBy(desc(conversations.createdAt));
    } catch (error) {
      console.error('[ChatStorage] getAllConversations failed:', { error });
      throw new Error(`Failed to get all conversations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async createConversation(title: string) {
    try {
      const [conversation] = await db.insert(conversations).values({ title }).returning();
      return conversation;
    } catch (error) {
      console.error('[ChatStorage] createConversation failed:', { title, error });
      throw new Error(`Failed to create conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async deleteConversation(id: number) {
    try {
      await db.delete(messages).where(eq(messages.conversationId, id));
      await db.delete(conversations).where(eq(conversations.id, id));
    } catch (error) {
      console.error('[ChatStorage] deleteConversation failed:', { id, error });
      throw new Error(`Failed to delete conversation ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async getMessagesByConversation(conversationId: number) {
    try {
      return await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
    } catch (error) {
      console.error('[ChatStorage] getMessagesByConversation failed:', { conversationId, error });
      throw new Error(`Failed to get messages for conversation ${conversationId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async createMessage(conversationId: number, role: string, content: string) {
    try {
      const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
      return message;
    } catch (error) {
      console.error('[ChatStorage] createMessage failed:', { conversationId, role, error });
      throw new Error(`Failed to create message for conversation ${conversationId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

