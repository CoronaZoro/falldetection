"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, User } from "lucide-react";
import type { ChatMessage } from "@/types";

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "I'm your emergency first aid assistant. Ask me what to do if someone has fallen or is injured.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: msg }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: messages }),
      });
      const data = await res.json();
      setMessages([
        ...next,
        { role: "assistant", content: data.message ?? "No response." },
      ]);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "Connection error." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='bg-[#111318] border border-[#1e2229] rounded p-3 flex flex-col gap-2.5 h-full'>
      <div className='flex items-center gap-2'>
        <Bot size={12} className='text-[#8b5cf6]' />
        <span className='text-sm font-medium text-gray-400'>First Aid AI</span>
      </div>

      <div ref={scrollRef} className='flex-1 overflow-y-auto max-h-32 flex flex-col gap-1.5'>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-1.5 items-start ${m.role === "user" ? "justify-end" : ""}`}
          >
            {m.role === "assistant" && (
              <Bot size={12} className='text-[#8b5cf6] shrink-0 mt-0.5' />
            )}
            <p
              className={`text-xs leading-relaxed text-[#c9d1e0] px-2 py-1 rounded max-w-[88%] ${
                m.role === "user" ? "bg-[#3b82f6]/10" : "bg-[#8b5cf6]/08"
              }`}
            >
              {m.content}
            </p>
            {m.role === "user" && (
              <User size={12} className='text-[#3b82f6] shrink-0 mt-0.5' />
            )}
          </div>
        ))}
        {loading && (
          <p className='text-[11px] text-[#4a5568] italic pl-5'>Thinking…</p>
        )}
      </div>

      <div className='flex gap-1.5'>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder='Ask about first aid…'
          disabled={loading}
          className='flex-1 bg-[#0a0c10] border border-[#1e2229] rounded px-2.5 py-1.5 text-xs text-[#c9d1e0] outline-none focus:border-[#3b82f6] disabled:opacity-40 transition-colors'
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className='bg-[#3b82f6] hover:bg-[#2563eb] border-none rounded px-2 py-1.5 text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center transition-colors'
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}
