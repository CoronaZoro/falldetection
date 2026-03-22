import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an emergency first aid assistant for a fall detection system called GUARDIAN.
Give short, clear, actionable instructions.
Focus on fall and injury response only.
Use bullet points for instructions.
Keep responses under 150 words.`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { message, history = [] } = await req.json();

    const messages = [
      ...history.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages,
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "No response";
    return NextResponse.json({ message: text });
  } catch (err) {
    console.error("Chat error:", err);
    return NextResponse.json({ message: "AI service unavailable. Check your API key." }, { status: 200 });
  }
}
