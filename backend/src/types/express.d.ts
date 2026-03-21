import "express";

declare module "express-serve-static-core" {
  interface Application {
    locals: {
      emitter?: {
        emitToUser(userId: string, event: string, payload: any): void;
        emitToChat(chatId: string, event: string, payload: any): void;
      };
      [key: string]: any;
    };
  }
}
