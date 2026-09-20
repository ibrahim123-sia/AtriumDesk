import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  sendGuestMessage,
  clearGuestSession,
  fetchGuestListings,
  fetchGuestBranding,
} from "../redux/slices/guestSlice";
import { toggleTheme as toggleThemeAction } from "../redux/slices/themeSlice";
import GuestSidebar from "./GuestSidebar";
import {
  Send,
  Brain,
  Calendar,
  Book,
  Info,
  Sparkles,
  Users,
  Building,
  Wallet,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";

const GuestChat = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const guestMessages = useSelector((s) => s.guest.guestMessages);
  const guestSessionId = useSelector((s) => s.guest.guestSessionId);
  const followUpChips = useSelector((s) => s.guest.followUpChips);
  const listings = useSelector((s) => s.guest.listings);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const universityShort = tenantBranding?.universityShort || "your university";

  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Rev5 §19.6 — per-session message cap: once the server says the
  // conversation has hit its limit, stop letting the guest keep trying and
  // show a persistent registration prompt instead of a one-off toast.
  const [sessionCapped, setSessionCapped] = useState(false);

  const toggleTheme = () => {
    dispatch(toggleThemeAction());
  };

  // Improved scrollToBottom function
  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      const { scrollHeight } = messagesContainerRef.current;
      messagesContainerRef.current.scrollTo({
        top: scrollHeight,
        behavior: "smooth"
      });
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [guestMessages]);

  // Rev5 §19.2 — this tenant's own scholarships + upcoming events for the funnel.
  useEffect(() => {
    dispatch(fetchGuestListings());
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchGuestBranding());
  }, [dispatch]);

  // Also scroll when loading state changes (when response starts coming)
  useEffect(() => {
    if (!isLoading) {
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 100);
    }
  }, [isLoading]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage("");
    setIsLoading(true);
    
    // Scroll immediately when user sends message
    setTimeout(scrollToBottom, 50);

    try {
      const result = await dispatch(
        sendGuestMessage({ message: userMessage })
      ).unwrap();

      if (!result.success) {
        if (result.sessionCapReached) {
          setSessionCapped(true);
          toast.error(result.message, { duration: 8000 });
        } else {
          toast.error(result.message || "Failed to send message");
        }
      }

      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error("Chat error:", error);
      toast.error("Failed to get response. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedTopic = async (topic) => {
    setInputMessage(topic);
    // Auto-send after a short delay
    setTimeout(() => {
      document.querySelector('button[type="submit"]')?.click();
    }, 100);
  };

  const handleClearChat = () => {
    dispatch(clearGuestSession());
    setSessionCapped(false);
    toast.success("Chat cleared. Start a new conversation.");
  };

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
      text: `Is ${universityShort} recognized by H.E.C?`,
    },
    {
      icon: <Book className="w-4 h-4" />,
      text: `In which areas does ${universityShort} offer degrees?`,
    },
    {
      icon: <Sparkles className="w-4 h-4" />,
      text: `Does ${universityShort} offer any scholarships?`,
    },
  ];

  // Format messages from context for display
  const displayMessages = guestMessages.map((msg, index) => ({
    id: index,
    text: msg.content,
    sender: msg.role === "user" ? "user" : "bot",
    timestamp: msg.timestamp || Date.now(),
    type: msg.type || "text",
  }));

  return (
    <div
      className={`flex h-screen ${
        theme === "dark"
          ? "bg-[#0A1614]"
          : "bg-linear-to-b from-[#D9F2EE] via-white to-[#F3F8F7]"
      }`}
    >
      <GuestSidebar
        activeTab="chat"
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        theme={theme}
        toggleTheme={toggleTheme}
        guestSessionId={guestSessionId}
        onClearChat={handleClearChat}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden md:ml-0">
        {/* Mobile Header */}
        <header
          className={`md:hidden sticky top-0 z-10 border-b ${
            theme === "dark"
              ? "bg-[#0F2320]/95 border-[#1E3A35] backdrop-blur-lg"
              : "bg-white/95 border-[#D9E7E4] backdrop-blur-lg"
          }`}
        >
          <div className="p-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setIsMenuOpen(true)}
                className="p-2 hover:bg-[#F3F8F7] dark:hover:bg-[#152E2A] rounded-lg"
              >
                <svg
                  className="w-6 h-6 text-[#0F2E2A] dark:text-[#E8F5F2]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>

              <div className="flex flex-col items-center">
                <h1 className="text-lg font-bold text-[#0F2E2A] dark:text-[#E8F5F2]">
                  AtriumDesk
                </h1>
                <p className="text-xs text-[#53716C] dark:text-[#8FB0AA]">
                  Guest Mode
                </p>
              </div>

              {guestSessionId && (
                <button
                  onClick={handleClearChat}
                  className="p-2 hover:bg-[#F3F8F7] dark:hover:bg-[#152E2A] rounded-lg"
                  title="Clear chat"
                >
                  <Trash2 className="w-5 h-5 text-[#53716C] dark:text-[#8FB0AA]" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Guest Limitations Banner */}
        <div
          className={`px-4 py-2 border-b ${
            theme === "dark"
              ? "bg-yellow-900/20 border-yellow-800/30"
              : "bg-yellow-50 border-yellow-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info
                className={`w-4 h-4 ${
                  theme === "dark" ? "text-yellow-400" : "text-yellow-600"
                }`}
              />
              <p
                className={`text-xs ${
                  theme === "dark" ? "text-yellow-300" : "text-yellow-700"
                }`}
              >
                Guest Mode: Text chat only • No voice/job features • Chat
                not saved unless you register
              </p>
            </div>
            <button
              onClick={() => navigate("/register")}
              className="cursor-pointer text-xs text-[#4E9128] dark:text-[#84CC16] hover:underline font-medium"
            >
              Upgrade →
            </button>
          </div>
        </div>

        {/* Chat Container */}
        <div className="flex-1 flex flex-col py-4 md:py-6 max-md:py-2 overflow-hidden">
          {/* Welcome Message when no chats */}
          {displayMessages.length === 0 && (
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
                    I'm your {universityShort} assistant. Ask me anything about
                    admissions, programs, fees, deadlines, and campus
                    information.
                    <br />
                    <span className="font-medium mt-1 block">
                      Start by typing your question or picking a topic below.
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 mb-4">
              {suggestedTopics.map((topic, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestedTopic(topic.text)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    theme === "dark"
                      ? "border-[#1E3A35] hover:bg-[#152E2A]"
                      : "border-[#D9E7E4] hover:bg-[#F3F8F7]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {topic.icon}
                    <p
                      className={`text-sm font-medium ${
                        theme === "dark" ? "text-[#E8F5F2]" : "text-[#0F2E2A]"
                      }`}
                    >
                      {topic.text}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {listings.events.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-[#0F2E2A] dark:text-[#E8F5F2] mb-2 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#0D9488] dark:text-[#4E9128]" />
                  Upcoming Events
                </h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  {listings.events.slice(0, 3).map((e) => (
                    <div
                      key={e._id}
                      className={`p-3 rounded-lg border text-sm ${
                        theme === "dark" ? "border-[#1E3A35] bg-[#0F2320]" : "border-[#D9E7E4] bg-white"
                      }`}
                    >
                      <p className="font-medium text-[#0F2E2A] dark:text-[#E8F5F2]">{e.title}</p>
                      <p className="text-xs text-[#53716C] dark:text-[#8FB0AA] mt-0.5">
                        {new Date(e.date).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
          )}

          {/* Chat Messages Area - Fixed with proper ref */}
          <div
            ref={messagesContainerRef}
            className="flex-1 mb-3 overflow-y-auto overscroll-contain scroll-smooth"
            style={{
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div className="w-full max-w-4xl mx-auto px-4 md:px-6">
            {displayMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.sender === "user" ? "justify-end" : "justify-start"
                } mb-3`}
              >
                <div
                  className={`max-w-[85%] md:max-w-[80%] rounded-2xl px-3 py-2 ${
                    message.sender === "user"
                      ? "bg-[#0D9488] text-white rounded-br-none"
                      : theme === "dark"
                      ? "bg-[#0F2320] text-[#E8F5F2] rounded-bl-none border border-[#1E3A35]"
                      : "bg-white text-[#0F2E2A] rounded-bl-none border border-[#D9E7E4] shadow-sm"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {message.sender === "bot" && (
                      <Brain className="w-4 h-4 text-[#0D9488] dark:text-[#4E9128] mt-0.5 shrink-0" />
                    )}
                    <p className="text-sm md:text-base wrap-break-words whitespace-pre-wrap">
                      {message.text}
                    </p>
                  </div>
                  <p
                    className={`text-xs mt-2 ${
                      message.sender === "user"
                        ? "text-white/70"
                        : theme === "dark"
                        ? "text-[#8FB0AA]"
                        : "text-[#53716C]"
                    }`}
                  >
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}

            {/* Rev5 §19.3 — context-aware follow-up chips on the latest answer */}
            {!isLoading && followUpChips.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 ml-6">
                {followUpChips.map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestedTopic(chip)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      theme === "dark"
                        ? "bg-[#0F2320] border-[#1E3A35] text-[#8FB0AA] hover:border-[#4E9128] hover:text-[#E8F5F2]"
                        : "bg-white border-[#D9E7E4] text-[#53716C] hover:border-[#0D9488] hover:text-[#0F2E2A]"
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                    theme === "dark"
                      ? "bg-[#0F2320] border border-[#1E3A35]"
                      : "bg-white border border-[#D9E7E4]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-[#4E9128] rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-[#4E9128] rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-[#4E9128] rounded-full animate-bounce"
                        style={{ animationDelay: "0.4s" }}
                      ></div>
                    </div>
                    <span
                      className={`text-sm ${
                        theme === "dark" ? "text-[#8FB0AA]" : "text-[#53716C]"
                      }`}
                    >
                      Thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Invisible element at the end for scrolling reference */}
            <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="w-full max-w-4xl mx-auto px-4 md:px-6">
          {sessionCapped ? (
            <div className="p-4 rounded-xl border bg-white dark:bg-[#0F2320] border-[#D9E7E4] dark:border-[#1E3A35] text-center space-y-2">
              <p className="text-sm font-medium text-[#0F2E2A] dark:text-[#E8F5F2]">
                You've reached the limit for a guest conversation.
              </p>
              <button
                onClick={() => navigate("/register")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium bg-[#0D9488] hover:bg-[#0B7A70]"
              >
                <Sparkles className="w-4 h-4" /> Register to keep chatting
              </button>
            </div>
          ) : (
          <form
            onSubmit={handleSendMessage}
            className="p-1 rounded-xl border bg-white dark:bg-[#0F2320] border-[#D9E7E4] dark:border-[#1E3A35] shadow-sm"
          >
            <div className="flex gap-1.5">
              {/* Input Field */}
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={`Ask about ${universityShort}…`}
                  className="w-full pl-3 pr-10 py-1.5 bg-transparent outline-none text-[#0F2E2A] dark:text-[#E8F5F2] placeholder-[#53716C] dark:placeholder-[#8FB0AA] text-sm rounded-lg border border-[#D9E7E4] dark:border-[#1E3A35] focus:border-[#0D9488] dark:focus:border-[#4E9128] focus:ring-1 focus:ring-[#0D9488]/20 dark:focus:ring-[#4E9128]/20"
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                />
              </div>

              {/* Send Button */}
              <button
                type="submit"
                disabled={isLoading || !inputMessage.trim()}
                className={`px-3 py-1.5 rounded-lg transition-all shrink-0 flex items-center justify-center ${
                  isLoading || !inputMessage.trim()
                    ? "bg-[#D9E7E4] dark:bg-[#1E3A35] cursor-not-allowed"
                    : "bg-linear-to-r from-[#0D9488] to-[#0D9488] hover:from-[#0B7A70] hover:to-[#0B7A70]"
                }`}
              >
                <Send
                  className={`w-3.5 h-3.5 ${
                    isLoading || !inputMessage.trim()
                      ? "text-[#8FB0AA]"
                      : "text-white"
                  }`}
                />
              </button>
            </div>

            {/* Guest Info */}
            <div className="flex items-center justify-between mt-1.5 px-1">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div>
                <span className="text-[10px] text-[#53716C] dark:text-[#8FB0AA]">
                  Guest Mode
                </span>
              </div>
              <div className="text-[10px] text-[#53716C] dark:text-[#8FB0AA]">
                <button
                  onClick={() => navigate("/register")}
                  className="text-[#4E9128] dark:text-[#84CC16] hover:underline"
                >
                  Register for voice & email →
                </button>
              </div>
            </div>
          </form>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GuestChat;