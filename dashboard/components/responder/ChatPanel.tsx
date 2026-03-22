"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, User } from "lucide-react";
import type { ChatMessage } from "@/types";

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "I'm your emergency first aid assistant. Ask me what to do if someone has fallen or is injured.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: messages }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.message ?? "Sorry, I couldn't respond." }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Connection error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#111318] border border-[#1e2229] rounded-lg p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2">
        <Bot size={14} className="text-[#8b5cf6]" />
        <span className="text-sm font-semibold text-[#c8d0e0]">First Aid AI</span>
        <span className="text-[11px] text-[#4a5568] ml-auto">Claude</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto max-h-36 flex flex-col gap-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-1.5 items-start ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "assistant" && (
              <Bot size={14} className="text-[#8b5cf6] shrink-0 mt-0.5" />
            )}
            <div
              className={`max-w-[85%] px-2.5 py-1.5 rounded text-[12px] leading-relaxed text-[#c8d0e0] border whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-[#3b82f6]/15 border-[#3b82f6]/20"
                  : "bg-[#8b5cf6]/10 border-[#8b5cf6]/15"
              }`}
            >
              {m.content}
            </div>
            {m.role === "user" && (
              <User size={14} className="text-[#3b82f6] shrink-0 mt-0.5" />
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-1.5 items-center">
            <Bot size={14} className="text-[#8b5cf6]" />
            <span className="text-[12px] text-[#4a5568] italic">Thinking...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about first aid..."
          disabled={loading}
          className="flex-1 bg-[#0a0c10] border border-[#1e2229] rounded px-2.5 py-1.5 text-[#c8d0e0] text-[13px] outline-none focus:border-[#3b82f6] disabled:opacity-50 transition-colors"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="bg-[#3b82f6] border-none rounded px-2.5 py-1.5 text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex items-center hover:bg-[#2563eb] transition-colors"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
