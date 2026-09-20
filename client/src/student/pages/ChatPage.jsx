import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSelector } from "react-redux";
import axios from "../../utils/axios";
import Message from "../components/Message";
import toast from "react-hot-toast";
import {
  Send,
  Mail,
  Calendar,
  Book,
  Users,
  Building,
  Wallet,
  MessageSquare,
  Sparkles,
  Mic,
} from "lucide-react";

const ChatPage = () => {
  const containRef = useRef(null);
  const selectedChat = useSelector((s) => s.chat.selectedChat);
  const theme = useSelector((s) => s.theme.theme);
  const user = useSelector((s) => s.auth.user);
  const token = useSelector((s) => s.auth.token);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("text");

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef(null);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  // Refs for audio management
  const recordingTimeRef = useRef(0);
  const audioChunksRef = useRef([]);

  // Clean up audio resources on unmount
  useEffect(() => {
    return () => {
      cleanupAudioResources();
    };
  }, []);

  // Clean up audio resources
  const cleanupAudioResources = () => {
    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Reset audio chunks
    audioChunksRef.current = [];
  };

  // Convert blob to base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Start recording audio
  const startRecording = async () => {
    try {
      if (!selectedChat) {
        toast.error("Please select or create a chat first");
        return;
      }

      // Clean up any existing audio resources first
      cleanupAudioResources();

      // Request microphone access
      const stream = await navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
            channelCount: 1,
          },
        })
        .catch((error) => {
          console.error("Microphone access error:", error);

          if (
            error.name === "NotAllowedError" ||
            error.name === "PermissionDeniedError"
          ) {
            toast.error(
              "Microphone access denied. Please check browser permissions."
            );
          } else if (error.name === "NotFoundError") {
            toast.error("No microphone found on your device.");
          } else {
            toast.error(`Microphone error: ${error.message}`);
          }
          throw error;
        });

      // Get supported MIME type
      let mimeType = "";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      }

      const options = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);

      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        // Stop timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || "audio/webm",
        });
        const sizeMB = audioBlob.size / (1024 * 1024);

        // Stop all audio tracks
        stream.getTracks().forEach((track) => track.stop());

        // Check file size
        if (sizeMB > 2) {
          toast.error(
            `Voice message is ${sizeMB.toFixed(
              2
            )}MB. Maximum size is 2MB. Record a shorter message.`
          );
          setRecordingTime(0);
          recordingTimeRef.current = 0;
          return;
        }

        // Process the voice message
        await processVoiceMessage(audioBlob, recordingTimeRef.current);

        // Reset
        setRecordingTime(0);
        recordingTimeRef.current = 0;
      };

      // Handle recorder errors
      recorder.onerror = (event) => {
        console.error("Recorder error:", event);
        toast.error("Recording error. Please try again.");

        // Clean up on error
        stream.getTracks().forEach((track) => track.stop());
        cleanupAudioResources();
        setIsRecording(false);
        setRecordingTime(0);
        recordingTimeRef.current = 0;
      };

      // Start recording
      recorder.start(100);
      setMediaRecorder(recorder);
      setIsRecording(true);

      // Reset recording time
      setRecordingTime(0);
      recordingTimeRef.current = 0;

      // Start timer
      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime(recordingTimeRef.current);

        // Stop recording at 30 seconds
        if (recordingTimeRef.current >= 30) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          if (recorder && recorder.state === "recording") {
            recorder.stop();
            toast.info("Recording stopped automatically after 30 seconds.");
          }
        }
      }, 1000);
    } catch (error) {
      console.error("Error starting recording:", error);
      setIsRecording(false);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      cleanupAudioResources();
    }
  };

  // Stop recording and send
  const stopRecording = () => {
    if (mediaRecorder && isRecording && mediaRecorder.state === "recording") {
      try {
        mediaRecorder.stop();
        setIsRecording(false);
      } catch (error) {
        console.error("Error stopping recording:", error);
      }
    }

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Cancel recording
  const cancelRecording = () => {
    if (mediaRecorder && isRecording && mediaRecorder.state === "recording") {
      try {
        mediaRecorder.stop();
        setIsRecording(false);
      } catch (error) {
        console.error("Error canceling recording:", error);
      }
    }

    // Clean up all resources
    cleanupAudioResources();

    // Reset
    setRecordingTime(0);
    recordingTimeRef.current = 0;
    toast.info("Recording cancelled");
  };

  // User request — voice used to transcribe AND auto-send in one shot, with
  // no chance to fix a misheard word before it became a real chat turn.
  // This only transcribes (via /api/message/voice/transcribe, which never
  // touches the chat or the LLM) and drops the result into the text input
  // for the student to review/edit; sending is then the normal Send click.
  const processVoiceMessage = async (audioBlob, duration) => {
    if (!user || !selectedChat) {
      toast.error("Please login and select a chat to send voice messages");
      return;
    }

    const sizeMB = audioBlob.size / (1024 * 1024);

    if (sizeMB > 2) {
      toast.error(
        `Voice message is ${sizeMB.toFixed(2)}MB. Maximum size is 2MB.`
      );
      return;
    }

    if (sizeMB < 0.001 || duration < 1) {
      toast.error(
        "Recording is too short. Please speak for at least 2 seconds."
      );
      return;
    }

    if (duration < 2 && sizeMB < 0.01) {
      toast.error("No speech detected. Please speak clearly.");
      return;
    }

    setIsProcessingVoice(true);
    setLoading(true);

    try {
      const base64Audio = await blobToBase64(audioBlob);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const response = await axios.post(
        "/api/message/voice/transcribe",
        { audioUrl: base64Audio, duration: duration, fileSize: sizeMB.toFixed(2) },
        {
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (response.data.success) {
        // Populate the text input rather than sending — the student reviews
        // (and can correct) the transcription, then sends it themselves.
        setPrompt((prev) => (prev ? `${prev} ${response.data.transcription}` : response.data.transcription));
        toast.success("Transcribed — review and press Send.");

        if (response.data.transcriptionDetails?.isFallback) {
          toast(
            "Voice transcribed with basic fallback. Text may be less accurate.",
            { icon: "⚠️", duration: 4000 }
          );
        }
      } else if (
        response.data.message?.includes("No speech detected") ||
        response.data.message?.includes("too short")
      ) {
        toast.error("No speech detected. Please speak clearly and try again.");
      } else {
        toast.error(response.data.message || "Failed to transcribe voice message");
      }
    } catch (error) {
      console.error("Error transcribing voice:", error);

      if (error.name === "AbortError") {
        toast.error("Request timeout. Please try again.");
      } else if (error.response?.status === 413) {
        toast.error(
          "Voice message too large. Please record a shorter message (max 2MB)."
        );
      } else if (error.response?.status === 400) {
        const errorMsg = error.response.data.message || "Invalid audio format.";
        if (
          errorMsg.includes("too small") ||
          errorMsg.includes("speak longer")
        ) {
          toast.error(
            "Recording too short. Please speak for at least 2-3 seconds."
          );
        } else {
          toast.error(errorMsg);
        }
      } else if (error.response?.status === 500) {
        toast.error("Server error transcribing voice. Please try again.");
      } else {
        toast.error("Failed to transcribe voice message. Please try again.");
      }
    } finally {
      setIsProcessingVoice(false);
      setLoading(false);
    }
  };

  // Format time (MM:SS)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  useEffect(() => {
    if (selectedChat) {
      setMessages(selectedChat.messages || []);
    } else {
      setMessages([]);
    }
  }, [selectedChat]);

  useEffect(() => {
    if (containRef.current) {
      containRef.current.scrollTo({
        top: containRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const uniShort = tenantBranding?.universityShort || "your university";
  const suggestedTopics = [
    {
      icon: <Wallet className="w-4 h-4" />,
      text: "What is the fee structure for the Bachelor programs?",
    },
    {
      icon: <Users className="w-4 h-4" />,
      text: "What documents are required at the time of admission?",
    },
    {
      icon: <Building className="w-4 h-4" />,
      text: `Is ${uniShort} recognized by H.E.C?`,
    },
    {
      icon: <Book className="w-4 h-4" />,
      text: `In which areas does ${uniShort} offer degrees?`,
    },
    {
      icon: <Sparkles className="w-4 h-4" />,
      text: `Does ${uniShort} offer any scholarships?`,
    },
  ];

  const handleTextSubmit = async (e) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || !selectedChat || loading) return;

    // Build the optimistic user message FIRST so the render that flushes
    // after this handler yields (await axios.post) already includes it.
    // Previously `content: prompt` was read after `setPrompt("")` which,
    // while technically a closure read, was fragile and hard to read.
    const userMsg = {
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      type: mode,
    };

    // flushSync forces React to commit BEFORE we hit `await axios.post`.
    // Without it, React 18's auto-batching can defer the render until after
    // the network response resolves on fast LLM replies — which is exactly
    // why the user bubble seemed to appear "after" the assistant reply.
    flushSync(() => {
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
    });
    setPrompt("");

    // Now that the DOM has the new bubble, scroll it into view.
    if (containRef.current) {
      containRef.current.scrollTo({
        top: containRef.current.scrollHeight,
        behavior: "smooth",
      });
    }

    try {
      const { data } = await axios.post(
        `/api/message/${mode}`,
        {
          chatId: selectedChat._id,
          prompt: trimmed,
        },
        { headers: { Authorization: token } }
      );

      if (data.success) {
        const reply = {
          ...data.reply,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, reply]);
      } else {
        toast.error(data.message);
        // Roll back: remove the optimistic message and restore the input.
        setMessages((prev) =>
          prev.filter((m) => m !== userMsg && m.timestamp !== userMsg.timestamp)
        );
        setPrompt(trimmed);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
      setMessages((prev) =>
        prev.filter((m) => m !== userMsg && m.timestamp !== userMsg.timestamp)
      );
      setPrompt(trimmed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`flex-1 flex flex-col h-full overflow-hidden ${
        theme === "dark"
          ? "bg-[#0A1614]"
          : "bg-linear-to-b from-[#D9F2EE] via-white to-[#F3F8F7]"
      }`}
    >
      {/* Chat Container */}
      <div className="flex-1 flex flex-col py-4 md:py-6 overflow-hidden">
        {/* Welcome Message when no chats */}
        {messages.length === 0 && !selectedChat && (
          <div className="w-full max-w-4xl mx-auto px-4 md:px-6">
          <div
            className={`mb-4 p-4 md:p-6 rounded-xl border ${
              theme === "dark"
                ? "bg-linear-to-r from-[#0F2320] to-[#152E2A] border-[#1E3A35]"
                : "bg-linear-to-r from-[#D9F2EE] to-[#F3F8F7] border-[#D9E7E4]"
            }`}
          >
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center relative bg-[#0D9488] shrink-0">
                <Sparkles className="w-6 h-6 text-white" />
                <span className="absolute bottom-1 left-2 right-2 h-0.5 rounded-full bg-[#4E9128]" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-lg font-bold text-[#0F2E2A] dark:text-[#E8F5F2] mb-2">
                  Welcome to AtriumDesk!
                </h2>
                <p
                  className={`text-sm ${
                    theme === "dark" ? "text-[#8FB0AA]" : "text-[#53716C]"
                  }`}
                >
                  Your intelligent assistant for {uniShort}. Ask questions,
                  draft emails, and get personalized help.
                </p>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Chat Messages Area */}
        <div
          ref={containRef}
          className="flex-1 mb-3 overflow-y-auto overscroll-contain scroll-smooth"
        >
          <div className="w-full max-w-4xl mx-auto px-4 md:px-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center min-h-[60vh]">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#D9F2EE] dark:bg-[#152E2A] flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 text-[#0D9488] dark:text-[#4E9128]" />
                </div>
                <p className="text-xl md:text-3xl text-center text-[#53716C] dark:text-[#8FB0AA] mb-2">
                  Ask me Anything
                </p>
                <p className="text-sm text-[#53716C] dark:text-[#8FB0AA]">
                  Start a conversation or choose a topic below
                </p>
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <Message
                key={index}
                message={message}
                chatId={selectedChat?._id}
                priorUserQuestion={message.role !== 'user' ? messages[index - 1]?.content : undefined}
              />
            ))
          )}

          {/* Loading Animation */}
          {loading && !isProcessingVoice && (
            <div className="flex justify-center py-4">
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#4E9128] animate-bounce"></div>
                  <div
                    className="w-2 h-2 rounded-full bg-[#4E9128] animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  ></div>
                  <div
                    className="w-2 h-2 rounded-full bg-[#4E9128] animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                </div>
                <p className="text-xs text-[#53716C] dark:text-[#8FB0AA]">
                  Processing...
                </p>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Suggested Topics */}
        {messages.length === 0 && !isRecording && (
          <div className="w-full max-w-4xl mx-auto px-4 md:px-6 mb-3">
            <p
              className={`text-xs mb-2 ${
                theme === "dark" ? "text-[#8FB0AA]" : "text-[#53716C]"
              }`}
            >
              Quick Start Topics:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestedTopics.map((topic, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setPrompt(topic.text);
                    if (topic.text.includes("email")) setMode("email");
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all flex-1 min-w-[45%] md:flex-initial md:min-w-0 ${
                    theme === "dark"
                      ? "bg-[#0F2320] hover:bg-[#152E2A] text-[#E8F5F2] border border-[#1E3A35]"
                      : "bg-white hover:bg-[#F3F8F7] text-[#0F2E2A] border border-[#D9E7E4] shadow-sm"
                  }`}
                >
                  {topic.icon}
                  <span className="truncate text-xs">{topic.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Voice Recording UI */}
        <div className="w-full max-w-4xl mx-auto px-4 md:px-6">
        {isRecording ? (
          <div
            className={`p-4 rounded-xl border ${
              theme === "dark"
                ? "bg-[#0F2320] border-[#1E3A35]"
                : "bg-[#FBE7E4] border-[#D9E7E4]"
            } shadow-sm`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#4E9128] flex items-center justify-center animate-pulse">
                  <Mic className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xl font-bold text-[#4E9128] dark:text-[#4E9128]">
                    {formatTime(recordingTime)}
                  </div>
                  <div className="text-xs text-[#53716C] dark:text-[#8FB0AA]">
                    Recording voice message...
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="px-4 py-2 text-sm text-[#53716C] dark:text-[#8FB0AA] hover:text-[#4E9128] rounded-lg hover:bg-white/60 dark:hover:bg-[#152E2A] transition-all"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-5 py-2 bg-[#0D9488] hover:bg-[#0B7A70] text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Normal Input Form */
          <form
            onSubmit={handleTextSubmit}
            className={`p-1 rounded-xl border ${
              theme === "dark"
                ? "bg-[#0F2320] border-[#1E3A35]"
                : "bg-white border-[#D9E7E4] shadow-sm"
            }`}
          >
            <div className="flex gap-1.5">
              {/* Input Field with Voice Button */}
              <div className="flex-1 relative">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  type="text"
                  placeholder={
                    mode === "email"
                      ? "Write email content..."
                      : "Type your query or record voice..."
                  }
                  required
                  className="w-full pl-3 pr-10 py-1.5 bg-transparent outline-none text-[#0F2E2A] dark:text-[#E8F5F2] placeholder-[#53716C] dark:placeholder-[#8FB0AA] text-sm rounded-lg border border-[#D9E7E4] dark:border-[#1E3A35] focus:border-[#0D9488] dark:focus:border-[#4E9128] focus:ring-1 focus:ring-[#0D9488]/20 dark:focus:ring-[#4E9128]/20"
                  disabled={isRecording || isProcessingVoice}
                />

                {/* Voice Button */}
                {!isRecording && !isProcessingVoice && (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={!selectedChat}
                    className="absolute right-1.5 top-1/2 transform -translate-y-1/2 p-1.5 rounded-md text-[#0D9488] dark:text-[#4E9128] hover:text-[#4E9128] dark:hover:text-[#84CC16] hover:bg-[#D9F2EE] dark:hover:bg-[#152E2A] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Record voice message"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Send Button */}
              <button
                type="submit"
                disabled={
                  loading ||
                  !prompt.trim() ||
                  !selectedChat ||
                  isRecording ||
                  isProcessingVoice
                }
                className={`px-3 py-1.5 rounded-lg transition-all shrink-0 flex items-center justify-center ${
                  loading ||
                  !prompt.trim() ||
                  !selectedChat ||
                  isRecording ||
                  isProcessingVoice
                    ? "bg-[#D9E7E4] dark:bg-[#1E3A35] cursor-not-allowed"
                    : "bg-linear-to-r from-[#0D9488] to-[#0D9488] hover:from-[#0B7A70] hover:to-[#0B7A70]"
                }`}
              >
                {loading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Send className="w-3.5 h-3.5 text-white" />
                )}
              </button>
            </div>

            {/* Mode Indicator */}
            <div className="flex items-center gap-1 mt-1.5 px-1">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  mode === "email" ? "bg-[#0D9488]" : "bg-[#2C7A4C]"
                }`}
              ></div>
              <span
                className={`text-[10px] ${
                  theme === "dark" ? "text-[#8FB0AA]" : "text-[#53716C]"
                }`}
              >
                {mode === "email" ? "Email Mode" : "Chat Mode"}
              </span>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
