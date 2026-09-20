import express from 'express'
import {
  textMessageController,
    emailMessageController,
    voiceMessageController,
    transcribeVoiceController,
    transcriptionHealth
} from '../controllers/messageController.js'
import { protect } from '../middlewares/auth.js'
import { requireFeature } from '../middlewares/requireFeature.js'

const messageRouter = express.Router()

// Apply protection to all routes
messageRouter.use(protect)

messageRouter.post('/text', requireFeature('chatbot'), textMessageController)

messageRouter.post('/email', requireFeature('chatbot'), emailMessageController)

messageRouter.post('/voice', requireFeature('chatbot'), voiceMessageController)

// Transcribe-only — populates the text input for the student to review/
// edit before sending, instead of auto-answering the raw transcription.
messageRouter.post('/voice/transcribe', requireFeature('chatbot'), transcribeVoiceController)

// Health check
messageRouter.get('/health', transcriptionHealth)

export default messageRouter