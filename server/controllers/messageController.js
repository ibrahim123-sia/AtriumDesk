import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import fetch from "node-fetch";
import FormData from "form-data";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Python FastAPI backend URL — RAG + local Whisper transcription live here
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

// Helper function to call Python backend
async function getPythonBackendResponse(question, context = {}) {
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET || "",
      },
      body: JSON.stringify({
        question,
        user_id: context.userId ? String(context.userId) : undefined,
        chat_id: context.chatId ? String(context.chatId) : undefined,
        // Which university's knowledge base to search — without this,
        // Python's RAG cache has no way to know which tenant's ChromaDB
        // collection a logged-in student's question belongs to.
        tenant_slug: context.tenantSlug || undefined,
        // Conversation memory: prior turns of this chat, oldest → newest.
        // Lets the LLM resolve follow-ups like "and its fee?" without
        // re-explaining the topic each turn.
        history: Array.isArray(context.history) ? context.history : undefined,
        // Rev 5 §8.7 USER_TYPE — every caller of this controller is an
        // authenticated user with a portal account (student/staff/admin).
        user_type: "student",
        university_name: context.branding?.universityName || undefined,
        university_short: context.branding?.universityShort || undefined,
        rag_config: context.ragConfig || undefined,
      }),
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`Python backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    return {
      answer: data.answer || "No response from Python backend",
      confidenceTier: data.confidence_tier || null,
      usage: data.usage || null,
    };
  } catch (error) {
    console.error("❌ Error calling Python backend:", error.message);
    throw new Error(`Failed to get response from Python backend: ${error.message}`);
  }
}

// Super Admin Usage tab — fire-and-forget, same resilience style as
// logIfFailedQuestion above. `usage` is null on a cache-hit/no-LLM-call
// answer (see python/rag.py's ask()) — nothing to log in that case.
async function logAiUsage(models, usage, { userType, userId, endpoint }) {
  if (!usage) return;
  try {
    await models.AiUsageLog.create({
      userType, userId: userId || null, endpoint,
      provider: usage.provider || "", model: usage.model || "",
      promptTokens: usage.promptTokens || 0,
      completionTokens: usage.completionTokens || 0,
      totalTokens: usage.totalTokens || 0,
    });
  } catch (error) {
    console.error("Failed to log AI usage:", error.message);
  }
}

// Rev 5 §4.3 — "Log every low-confidence or unanswered question." Fire-and-
// forget: a logging failure must never break the chat response itself.
async function logIfFailedQuestion(models, { question, confidenceTier, userType, userId }) {
  if (confidenceTier !== "low") return;
  try {
    await models.FailedQuestion.create({ question, userType, userId: userId || null });
  } catch (error) {
    console.error("Failed to log failed-question:", error.message);
  }
}

// How many prior messages to send to the LLM as conversational context.
// 6 = 3 full turns. Tuned to keep token usage low on a local 3B model
// while still resolving short follow-up references.
const HISTORY_TURN_LIMIT = 6;

// Build the trimmed history payload from a Chat document. Only role/content
// is sent — voice metadata, email fields, timestamps etc. are stripped to
// keep the prompt small and the schema simple on the Python side.
function buildHistoryPayload(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const recent = messages.slice(-HISTORY_TURN_LIMIT);
  return recent
    .filter((m) => m && m.role && m.content)
    .map((m) => ({ role: m.role, content: String(m.content) }));
}

// Helper function to save base64 audio to temporary file
const saveBase64ToTempFile = (base64Data, fileExtension = "webm") => {
  try {
    const base64String = base64Data.includes('base64,') 
      ? base64Data.split('base64,')[1] 
      : base64Data;
    
    const filename = `audio_${uuidv4()}.${fileExtension}`;
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, filename);
    
    fs.writeFileSync(filePath, base64String, 'base64');
    return filePath;
  } catch (error) {
    console.error("Error saving base64 to file:", error);
    throw new Error("Failed to save audio file");
  }
};

// Clean up temp files
const cleanupTempFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error("Error cleaning up temp file:", error.message);
    }
  }
};

// Validate audio quality
const validateAudioQuality = (audioPath) => {
  try {
    const stats = fs.statSync(audioPath);
    
    if (stats.size < 1024) {
      return { 
        valid: false, 
        error: "Audio file is too small. Please speak longer (at least 2-3 seconds)."
      };
    }
    
    if (stats.size > 5 * 1024 * 1024) {
      return { 
        valid: false, 
        error: "Audio file is too large. Maximum size is 5MB."
      };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: "Failed to validate audio file" };
  }
};

// Transcribe audio by forwarding the file to the local Python /transcribe
// endpoint (faster-whisper). No data leaves this machine.
async function transcribeWithPython(audioPath) {
  try {

    if (!fs.existsSync(audioPath)) {
      return { success: false, error: "Audio file not found" };
    }

    const form = new FormData();
    form.append("file", fs.createReadStream(audioPath), {
      filename: path.basename(audioPath),
    });

    const response = await fetch(`${PYTHON_BACKEND_URL}/transcribe`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
      timeout: 120000, // Whisper on CPU can take a while on long clips
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        success: false,
        error: `Python /transcribe returned ${response.status}: ${detail.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    if (!data.text || !data.text.trim()) {
      return { success: false, error: "Whisper returned empty transcription" };
    }


    return {
      success: true,
      text: data.text.trim(),
      service: "whisper",
      language: data.language,
      duration: data.duration,
    };
  } catch (error) {
    console.error("💥 Whisper transcription error:", error.message);
    return { success: false, error: `Transcription failed: ${error.message}` };
  }
}

// Simple fallback transcription
async function transcribeWithBasicFallback(audioPath) {
  try {
    const stats = fs.statSync(audioPath);
    const sizeKB = Math.round(stats.size / 1024);
    
    const placeholderText = `[Voice message received (${sizeKB}KB). Please try sending your message as text.]`;
    
    return {
      success: true,
      text: placeholderText,
      isFallback: true,
      service: "basic-fallback"
    };
  } catch (error) {
    return {
      success: false,
      error: "Fallback transcription failed"
    };
  }
}

// Text Message Controller - UPDATED TO USE PYTHON BACKEND
export const textMessageController = async (req, res) => {
  try {
    const userId = req.user._id;

    const { chatId, prompt } = req.body;

    const chat = await req.models.Chat.findOne({ userId, _id: chatId });
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    // Snapshot prior history BEFORE pushing the new user message — the
    // history we send to Python must not contain the question we're about
    // to ask (it would be a duplicate of `prompt`).
    const history = buildHistoryPayload(chat.messages);

    // Add user message
    const userMessage = {
      type: "text",
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };
    chat.messages.push(userMessage);
    await chat.save();

    // Get response from Python backend
    let replyContent, confidenceTier, usage;
    try {
      ({ answer: replyContent, confidenceTier, usage } = await getPythonBackendResponse(prompt, {
        userId,
        chatId,
        history,
        tenantSlug: req.tenant.slug,
        branding: req.tenant?.branding,
        ragConfig: req.tenant?.ragConfig,
      }));
    } catch (error) {
      console.error("Failed to get response from Python backend:", error.message);
      replyContent = "Sorry, I'm unable to connect to the university knowledge base at the moment. Please try again later.";
      confidenceTier = null;
      usage = null;
    }
    logIfFailedQuestion(req.models, { question: prompt, confidenceTier, userType: "student", userId });
    logAiUsage(req.models, usage, { userType: req.user.role, userId, endpoint: "chat" });

    const reply = {
      type: "text",
      role: "assistant",
      content: replyContent,
      confidenceTier,
      timestamp: Date.now(),
    };

    // Save AI response
    chat.messages.push(reply);
    await chat.save();

    // Update chat title if this is the first real message
    if (chat.messages.filter(m => m.role === "user").length === 1) {
      // Use first 5 words of the question as title
      const title = prompt.split(' ').slice(0, 5).join(' ') + (prompt.split(' ').length > 5 ? '...' : '');
      chat.title = title;
      await chat.save();
    }

    res.json({
      success: true,
      reply,
      userMessage: userMessage,
      source: "python_backend"
    });

  } catch (error) {
    console.error("Error in textMessageController:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error processing your request",
    });
  }
};

// Email Message Controller — routes through the same Python /ask endpoint.
export const emailMessageController = async (req, res) => {
  try {
    const userId = req.user._id;

    const { chatId, prompt, recipient, subject } = req.body;

    const chat = await req.models.Chat.findOne({ userId, _id: chatId });
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    // Snapshot prior history BEFORE pushing the new user email message
    const history = buildHistoryPayload(chat.messages);

    // Add user message
    const userMessage = {
      type: "email",
      role: "user",
      content: prompt,
      emailData: {
        recipient: recipient || "",
        subject: subject || "",
        isSent: false,
      },
      timestamp: Date.now(),
    };
    chat.messages.push(userMessage);
    await chat.save();

    // For email generation, you might want to create a separate endpoint in Python
    // For now, we'll use the same /ask endpoint with modified prompt
    const emailPrompt = `Please help draft an email based on: ${prompt}
    Recipient: ${recipient || "Not specified"}
    Subject: ${subject || "No subject"}
    Please format the email professionally with salutation, body, and closing.`;

    let replyContent, usage;
    try {
      ({ answer: replyContent, usage } = await getPythonBackendResponse(emailPrompt, {
        userId,
        chatId,
        history,
        tenantSlug: req.tenant.slug,
        branding: req.tenant?.branding,
        ragConfig: req.tenant?.ragConfig,
      }));
    } catch (error) {
      console.error("Failed to get email response from Python backend:", error.message);
      replyContent = "Sorry, I'm unable to draft emails at the moment. Please try again later.";
      usage = null;
    }
    logAiUsage(req.models, usage, { userType: req.user.role, userId, endpoint: "email" });

    const reply = {
      type: "email",
      role: "assistant",
      content: replyContent,
      emailData: {
        recipient: recipient || "",
        subject: subject || "Drafted Email",
        isSent: false,
      },
      timestamp: Date.now(),
    };

    // Save AI response
    chat.messages.push(reply);
    await chat.save();

    res.json({
      success: true,
      reply,
      userMessage: userMessage,
      source: "python_backend"
    });

  } catch (error) {
    console.error("Error in emailMessageController:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error generating email",
    });
  }
};

// Voice Message Controller - UPDATED TO USE PYTHON BACKEND
export const voiceMessageController = async (req, res) => {
  let tempFilePath = null;
  
  try {
    const userId = req.user._id;

    const { chatId, audioUrl, duration, fileSize } = req.body;

    if (!audioUrl) {
      return res.status(400).json({
        success: false,
        message: "Audio data is required",
      });
    }

    if (!audioUrl.startsWith('data:audio/')) {
      return res.status(400).json({
        success: false,
        message: "Invalid audio format. Expected base64 audio data.",
      });
    }

    const chat = await req.models.Chat.findOne({ userId, _id: chatId });
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }


    // Determine file extension
    let fileExtension = 'webm';
    const mimeMatch = audioUrl.match(/data:audio\/([^;]+);/);
    if (mimeMatch) {
      const mimeType = mimeMatch[1];
      if (mimeType.includes('wav')) fileExtension = 'wav';
      else if (mimeType.includes('mp3')) fileExtension = 'mp3';
      else if (mimeType.includes('ogg')) fileExtension = 'ogg';
      else if (mimeType.includes('m4a')) fileExtension = 'm4a';
    }

    // Save to temp file
    tempFilePath = saveBase64ToTempFile(audioUrl, fileExtension);
    
    // Validate audio
    const validation = validateAudioQuality(tempFilePath);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      });
    }

    // Transcribe with local Whisper (via Python service)
    let transcription = await transcribeWithPython(tempFilePath);

    // If Whisper fails, use basic fallback
    if (!transcription.success) {
      transcription = await transcribeWithBasicFallback(tempFilePath);
      
      if (!transcription.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to process voice message. Please try again or use text input.",
        });
      }
    }

    const transcribedText = transcription.text.trim();
    
    // Enhanced validation for transcribed text
    if (!transcribedText || transcribedText === "") {
      return res.status(400).json({
        success: false,
        message: "No speech detected in your recording. Please speak clearly and try again.",
      });
    }

    // Check if transcription is just fallback placeholder
    if (transcription.isFallback && transcribedText.includes('[Voice message received')) {
      return res.status(400).json({
        success: false,
        message: "Could not transcribe voice message. Please speak more clearly or try text input.",
        suggestion: "Speak louder and more clearly, or reduce background noise."
      });
    }


    // Snapshot history BEFORE we push the transcribed user message.
    const history = buildHistoryPayload(chat.messages);

    // Create user voice message
    const userMessage = {
      type: "voice",
      role: "user",
      content: transcribedText,
      voiceMeta: {
        duration: duration || 0,
        fileSize: fileSize || 0,
        wasTranscribed: true,
        transcriptionService: transcription.service || "unknown",
        isFallback: transcription.isFallback || false,
        audioFormat: fileExtension,
      },
      timestamp: Date.now(),
    };

    // Add user voice message to chat
    chat.messages.push(userMessage);

    // Get response from Python backend
    let aiResponse = "", confidenceTier = null, usage = null;
    try {
      ({ answer: aiResponse, confidenceTier, usage } = await getPythonBackendResponse(transcribedText, {
        userId,
        chatId,
        history,
        tenantSlug: req.tenant.slug,
        branding: req.tenant?.branding,
        ragConfig: req.tenant?.ragConfig,
      }));
    } catch (error) {
      console.error("Python backend Error:", error.message);
      aiResponse = "I received your voice message, but I'm having trouble accessing the knowledge base. Please try again or use text input.";
    }
    logIfFailedQuestion(req.models, { question: transcribedText, confidenceTier, userType: "student", userId });
    logAiUsage(req.models, usage, { userType: req.user.role, userId, endpoint: "voice" });

    const reply = {
      type: "text",
      role: "assistant",
      content: aiResponse,
      confidenceTier,
      timestamp: Date.now(),
      isVoiceResponse: true,
    };

    // Save AI response
    chat.messages.push(reply);
    
    // Save chat once with both messages
    await chat.save();

    // Update chat title if this is the first real message
    if (chat.messages.filter(m => m.role === "user" && !m.content.includes("[Processing")).length === 1) {
      // Use first few words as title
      chat.title = transcribedText.split(' ').slice(0, 5).join(' ') + (transcribedText.split(' ').length > 5 ? '...' : '');
      await chat.save();
    }


    // Send response
    res.json({
      success: true,
      reply: reply,
      transcription: transcribedText,
      transcriptionDetails: {
        service: transcription.service,
        isFallback: transcription.isFallback || false,
        audioFormat: fileExtension,
      },
      source: "python_backend",
      message: "Voice message processed successfully",
    });

  } catch (error) {
    console.error("Voice message processing error:", error.message);
    res.status(500).json({
      success: false,
      message: "Error processing voice message: " + error.message,
    });
  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }
  }
};

// User request — voice was previously transcribed AND auto-sent to the LLM
// in one shot, with no chance to review/fix a misheard word before it
// became a real chat turn. This does ONLY the transcription step — no chat
// message is created, no LLM is called — so the client can drop the text
// into the input box for the student to edit, then send it themselves via
// the normal text flow (textMessageController above).
export const transcribeVoiceController = async (req, res) => {
  let tempFilePath = null;
  try {
    const { audioUrl } = req.body;
    if (!audioUrl) {
      return res.status(400).json({ success: false, message: "Audio data is required" });
    }
    if (!audioUrl.startsWith("data:audio/")) {
      return res.status(400).json({ success: false, message: "Invalid audio format. Expected base64 audio data." });
    }

    let fileExtension = "webm";
    const mimeMatch = audioUrl.match(/data:audio\/([^;]+);/);
    if (mimeMatch) {
      const mimeType = mimeMatch[1];
      if (mimeType.includes("wav")) fileExtension = "wav";
      else if (mimeType.includes("mp3")) fileExtension = "mp3";
      else if (mimeType.includes("ogg")) fileExtension = "ogg";
      else if (mimeType.includes("m4a")) fileExtension = "m4a";
    }

    tempFilePath = saveBase64ToTempFile(audioUrl, fileExtension);

    const validation = validateAudioQuality(tempFilePath);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    let transcription = await transcribeWithPython(tempFilePath);
    if (!transcription.success) {
      transcription = await transcribeWithBasicFallback(tempFilePath);
      if (!transcription.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to transcribe voice message. Please try again or use text input.",
        });
      }
    }

    const transcribedText = transcription.text.trim();
    if (!transcribedText) {
      return res.status(400).json({
        success: false,
        message: "No speech detected in your recording. Please speak clearly and try again.",
      });
    }
    if (transcription.isFallback && transcribedText.includes("[Voice message received")) {
      return res.status(400).json({
        success: false,
        message: "Could not transcribe voice message. Please speak more clearly or try text input.",
        suggestion: "Speak louder and more clearly, or reduce background noise.",
      });
    }

    res.json({
      success: true,
      transcription: transcribedText,
      transcriptionDetails: {
        service: transcription.service,
        isFallback: transcription.isFallback || false,
        audioFormat: fileExtension,
      },
    });
  } catch (error) {
    console.error("Voice transcription error:", error.message);
    res.status(500).json({ success: false, message: "Error transcribing voice message: " + error.message });
  } finally {
    if (tempFilePath) cleanupTempFile(tempFilePath);
  }
};

// Health check - Updated to check Python backend
export const transcriptionHealth = async (req, res) => {
  try {
    // Test Python backend connection
    let pythonBackendHealthy = false;
    try {
      const testResponse = await fetch(`${PYTHON_BACKEND_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": INTERNAL_SECRET || "",
        },
        body: JSON.stringify({ question: "test" }),
        timeout: 5000,
      });
      pythonBackendHealthy = testResponse.ok;
    } catch (error) {
      console.error("Python backend health check failed:", error.message);
    }
    
    const health = {
      pythonBackend: pythonBackendHealthy,
      pythonBackendUrl: PYTHON_BACKEND_URL,
      whisper: pythonBackendHealthy, // local transcription is part of the Python service
      timestamp: new Date().toISOString(),
      audioFormats: ["webm", "wav", "mp3", "ogg", "m4a"]
    };
    
    res.json({
      success: true,
      health,
      message: pythonBackendHealthy 
        ? "All systems operational" 
        : "Python backend connection issue"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Health check failed"
    });
  }
};

// You might also want to add a direct test endpoint
export const testPythonBackend = async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!question) {
      return res.status(400).json({
        success: false,
        message: "Question is required"
      });
    }
    
    const { answer, confidenceTier } = await getPythonBackendResponse(question);

    res.json({
      success: true,
      question,
      response: answer,
      confidenceTier,
      source: "python_backend"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export default {
  textMessageController,
  emailMessageController,
  voiceMessageController,
  transcriptionHealth,
  testPythonBackend
};