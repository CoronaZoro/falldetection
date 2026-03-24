"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, User } from "lucide-react";
import type { ChatMessage } from "@/types";

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "First aid assistant — ask what to do." },
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
      setMessages([...next, { role: "assistant", content: data.message ?? "No response." }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Connection error." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='bg-surface border border-line rounded p-2.5 flex flex-col gap-2 h-full'>
      <div className='flex items-center gap-1.5 shrink-0'>
        <Bot size={11} className='text-accent' />
        <span className='section-label'>First Aid AI</span>
      </div>

      <div ref={scrollRef} className='flex-1 min-h-0 overflow-y-auto flex flex-col gap-1'>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-1 items-start ${m.role === "user" ? "justify-end" : ""}`}
          >
            {m.role === "assistant" && (
              <Bot size={11} className='text-accent shrink-0 mt-0.5' />
            )}
            <p
              className={`text-[11px] leading-snug text-fg px-1.5 py-1 rounded max-w-[90%] ${
                m.role === "user" ? "bg-info/10" : "bg-accent/[0.08]"
              }`}
            >
              {m.content}
            </p>
            {m.role === "user" && (
              <User size={11} className='text-info shrink-0 mt-0.5' />
            )}
          </div>
        ))}
        {loading && (
          <p className='text-[10px] text-fg-muted italic pl-4'>Thinking…</p>
        )}
      </div>

      <div className='flex gap-1.5 shrink-0'>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder='Ask about patient care, first aid, or what to do next...'
          disabled={loading}
          className='flex-1 bg-page border border-line rounded px-2 py-1 text-[11px] text-fg outline-none focus:border-info disabled:opacity-40 transition-colors'
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className='bg-info hover:bg-info-dark border-none rounded px-2 py-1 text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center transition-colors'
        >
          <Send size={11} />
        </button>
      </div>
    </div>
  );
}
