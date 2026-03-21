-- Add CALL message type for call log entries in chat history
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'CALL';
