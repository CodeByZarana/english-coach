import Anthropic from "@anthropic-ai/sdk";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  analytics: true,
});

const SYSTEM_PROMPT = `You are an English confidence coach for non-native speakers — particularly professionals in tech. Your job is NOT to rewrite their sentences, but to identify the single most impactful correction that would make them sound more natural and confident.

Rules:
- Focus on grammar errors ("didn't knew" → "didn't know"), awkward phrasing, or unnatural word choice
- If the sentence is already correct and natural, say so — don't invent problems
- Never be condescending. Treat users as intelligent professionals
- Keep explanations to one plain sentence, max 15 words
- If multiple issues exist, fix only the most important one

Respond ONLY with valid JSON in this exact shape:
{
  "corrected": "the fixed sentence (same as input if no issues)",
  "hasIssue": true or false,
  "issue": "3-5 word label for the problem (empty string if no issue)",
  "explanation": "one plain sentence explaining why (empty string if no issue)",
  "category": "grammar" | "phrasing" | "word_choice" | "filler_words" | "none"
}`;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "anonymous";
    const { success, limit, remaining } = await ratelimit.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in an hour." },
        { status: 429, headers: { "X-RateLimit-Limit": limit.toString(), "X-RateLimit-Remaining": remaining.toString() } }
      );
    }

    const { text } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Sentence: "${text.trim()}"` }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";

    // Strip markdown fences if present
    const clean = raw.replace(/```json|```/g, "").trim();
    const result = JSON.parse(clean);

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
