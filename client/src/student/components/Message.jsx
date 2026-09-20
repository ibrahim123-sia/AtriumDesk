import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { User, Bot, Mail, Calendar, Image as ImageIcon, Volume2, Mic, MessageSquarePlus } from 'lucide-react';
import Markdown from 'react-markdown';
import moment from 'moment';
import toast from 'react-hot-toast';
import { fetchDepartments } from '../../redux/slices/departmentSlice';
import { fetchDepartmentSuggestion, createIssueFromChat } from '../../redux/slices/issueSlice';

// Rev 5 §4.2 — low-confidence answers offer a one-click handoff to file an
// issue, with the chat transcript attached automatically. Kept inline here
// rather than a separate modal component since it only needs this message's
// own question/chatId, not any shared page state.
const HandoffPrompt = ({ chatId, question, isDark }) => {
  const dispatch = useDispatch();
  const departments = useSelector((s) => s.department.departments);
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState('');
  const [suggestedDepartmentId, setSuggestedDepartmentId] = useState(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filed, setFiled] = useState(false);

  const C = {
    border: isDark ? '#1E3A35' : '#D9E7E4',
    input: isDark ? '#081210' : '#FFFFFF',
    text: isDark ? '#E8F5F2' : '#0F2E2A',
    muted: isDark ? '#8FB0AA' : '#53716C',
    navy: isDark ? '#4E9128' : '#0D9488',
  };

  const openForm = async () => {
    setOpen(true);
    if (!departments?.length) dispatch(fetchDepartments());
    const result = await dispatch(fetchDepartmentSuggestion(question)).unwrap();
    if (result.success && result.suggestedDepartmentId) {
      setSuggestedDepartmentId(result.suggestedDepartmentId);
      setDepartmentId(result.suggestedDepartmentId);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!departmentId) {
      toast.error('Please choose a department.');
      return;
    }
    setSubmitting(true);
    const result = await dispatch(
      createIssueFromChat({ chatId, departmentId, suggestedDepartmentId, description: details.trim() })
    ).unwrap();
    setSubmitting(false);
    if (result.success) {
      setFiled(true);
      toast.success('Query filed — the department will follow up.');
    } else {
      toast.error(result.message || 'Failed to file a query');
    }
  };

  if (filed) {
    return (
      <p className="text-xs mt-2" style={{ color: C.muted }}>
        Query filed with the department — check "My Issues" for updates.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openForm}
        className="inline-flex items-center gap-1.5 text-xs mt-2 px-2.5 py-1 rounded-full border"
        style={{ borderColor: C.border, color: C.navy }}
      >
        <MessageSquarePlus className="w-3.5 h-3.5" /> File a query about this
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 p-2.5 rounded-lg border space-y-2" style={{ borderColor: C.border }}>
      <select
        value={departmentId}
        onChange={(e) => setDepartmentId(e.target.value)}
        className="w-full px-2 py-1.5 rounded-lg border text-xs focus:outline-none"
        style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
      >
        <option value="">Choose a department…</option>
        {(departments || []).map((d) => (
          <option key={d._id} value={d._id}>{d.code} — {d.name}</option>
        ))}
      </select>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={2}
        placeholder="Add any extra detail (optional) — the chat transcript is attached automatically."
        className="w-full px-2 py-1.5 rounded-lg border text-xs focus:outline-none resize-y"
        style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-xs px-2.5 py-1" style={{ color: C.muted }}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !departmentId}
          className="text-xs px-3 py-1 rounded-full text-white disabled:opacity-60"
          style={{ backgroundColor: C.navy }}
        >
          {submitting ? 'Filing…' : 'File query'}
        </button>
      </div>
    </form>
  );
};

const Message = ({ message, chatId, priorUserQuestion }) => {
  const theme = useSelector((s) => s.theme.theme);
  const isUser = message.role === 'user';
  const isDark = theme === 'dark';

  return (
    <div className={`flex items-start gap-3 my-3 sm:my-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Assistant Avatar */}
      {!isUser && (
        <div
          className="w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0"
          style={{
            backgroundColor: isDark ? '#1C2B12' : '#E7F4D9',
            color: isDark ? '#84CC16' : '#4E9128',
          }}
        >
          <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      )}

      {/* Message Content */}
      <div
        className="max-w-[85%] sm:max-w-[80%] rounded-2xl px-3 py-2"
        style={{
          backgroundColor: isUser
            ? isDark ? '#152E2A' : '#0D9488'
            : isDark ? '#0F2320' : '#FFFFFF',
          color: isUser
            ? '#FFFFFF'
            : isDark ? '#E8F5F2' : '#0F2E2A',
          border: isUser
            ? 'none'
            : isDark ? '1px solid #1E3A35' : '1px solid #D9E7E4',
          boxShadow: !isUser && !isDark ? '0 1px 2px rgba(30, 46, 110, 0.04)' : 'none',
        }}
      >
        {/* Message Header */}
        <div className="flex items-center gap-2 mb-2">
          {message.type === 'email' && <Mail className="w-4 h-4" />}
          {message.type === 'deadline' && <Calendar className="w-4 h-4" />}
          {message.isImage && <ImageIcon className="w-4 h-4" />}
          {message.type === 'voice' && (
            <div className="flex items-center gap-1">
              <Mic className="w-4 h-4" />
              <span className="text-xs opacity-75">Voice Message</span>
            </div>
          )}
          {message.isVoiceResponse && <Volume2 className="w-4 h-4" />}
          <span className="text-xs font-medium opacity-75">
            {isUser ? 'You' : 'UniAssist'}
          </span>
        </div>

        {/* Message Body */}
        <div className="text-sm sm:text-base">
          {/* Voice message processing indicator */}
          {message.type === 'voice' && message.isProcessing && (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: isDark ? '#84CC16' : '#4E9128' }}
            >
              <Mic className="w-4 h-4 animate-pulse" />
              <span>Processing voice message...</span>
            </div>
          )}

          {/* Voice response indicator (assistant) */}
          {message.isVoiceResponse && (
            <div
              className="flex items-center gap-2 text-xs mb-2"
              style={{ color: isDark ? '#84CC16' : '#4E9128' }}
            >
              <Volume2 className="w-3 h-3" />
              <span>Response to your voice message</span>
            </div>
          )}

          {/* Regular message content */}
          {message.isImage ? (
            <img
              src={message.content}
              alt="Generated"
              className="w-full max-w-md mt-2 rounded-lg"
              loading="lazy"
            />
          ) : (
            <div className="wrap-break-words">
              <Markdown
                components={{
                  code({ className, children, ...props }) {
                    return (
                      <code
                        className={`${className} px-1 py-0.5 rounded text-sm`}
                        style={{
                          backgroundColor: isDark ? '#081210' : '#F3F8F7',
                          color: isDark ? '#E8F5F2' : '#0F2E2A',
                        }}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  pre({ children, ...props }) {
                    return (
                      <pre
                        className="p-3 rounded-lg overflow-x-auto my-2 text-sm"
                        style={{
                          backgroundColor: isDark ? '#081210' : '#F3F8F7',
                          color: isDark ? '#E8F5F2' : '#0F2E2A',
                        }}
                        {...props}
                      >
                        {children}
                      </pre>
                    );
                  },
                }}
              >
                {message.content}
              </Markdown>
            </div>
          )}

          {!isUser && message.confidenceTier === 'low' && chatId && priorUserQuestion && (
            <HandoffPrompt chatId={chatId} question={priorUserQuestion} isDark={isDark} />
          )}

          {/* Voice message metadata */}
          {message.type === 'voice' && message.voiceMeta && (
            <div
              className="text-xs mt-2"
              style={{ color: isUser ? 'rgba(255,255,255,0.7)' : isDark ? '#8FB0AA' : '#53716C' }}
            >
              Duration: {message.voiceMeta.duration}s
              {message.voiceMeta.transcriptionService && (
                <span className="ml-2">
                  • Service: {message.voiceMeta.transcriptionService}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <div
          className="text-xs mt-3"
          style={{
            color: isUser
              ? 'rgba(255,255,255,0.7)'
              : isDark ? '#8FB0AA' : '#53716C',
          }}
        >
          {moment(message.timestamp).format('h:mm A')}
        </div>
      </div>

      {/* User Avatar */}
      {isUser && (
        <div
          className="w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0"
          style={{
            backgroundColor: isDark ? '#152E2A' : '#D9F2EE',
            color: isDark ? '#E8F5F2' : '#0D9488',
          }}
        >
          <User className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      )}
    </div>
  );
};

export default Message;
