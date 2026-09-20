import express from 'express'
import { 
  createChat, 
  getChats, 
  getChatById, 
  deleteChat, 
  updateChatName,
  clearChatMessages,
  getChatStats 
} from '../controllers/chatController.js'
import { protect } from '../middlewares/auth.js'

const chatRouter = express.Router()

// Create a new chat
chatRouter.post('/create', protect, createChat)

// Get all chats for user
chatRouter.get('/all', protect, getChats)

// Get specific chat by ID
chatRouter.get('/:chatId', protect, getChatById)

// Delete a chat
chatRouter.delete('/delete', protect, deleteChat)

// Update chat name
chatRouter.put('/rename', protect, updateChatName)

// Clear all messages in a chat (keep chat)
chatRouter.post('/clear', protect, clearChatMessages)

// Get chat statistics
chatRouter.get('/:chatId/stats', protect, getChatStats)

export default chatRouter