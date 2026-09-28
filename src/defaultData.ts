import { PersonaPreset, Space, Memory } from "./types";

export const DEFAULT_MODELS = [
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (Google)", desc: "Google fast flagship multimodal model for general tasks & reasoning." },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (Google)", desc: "Google flagship reasoning, coding & complex task model." },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite (Google)", desc: "Google high-speed lightweight model." },
  { id: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image (Google)", desc: "Google high-quality image generation and editing model." },
  { id: "gemini-3.1-flash-lite-image", name: "Gemini 3.1 Flash Lite Image (Google)", desc: "Google lightweight image generation model." },
  { id: "gemini-3.5-transcribe", name: "Gemini 3.5 Transcribe (Google)", desc: "Google audio transcription and speech model." },
  { id: "thinkingmachines/Inkling", name: "Inkling (Tinker)", desc: "Tinker thinkingmachines model with advanced audio capability." },
  { id: "thinkingmachines/Inkling-Small", name: "Inkling Small (Tinker)", desc: "Thinking Machines Inkling Small model." },
  { id: "thinkingmachines/Inkling:peft:262144", name: "Inkling PEFT (Tinker)", desc: "Thinking Machines Inkling model (256k context window)." },
  { id: "thinkingmachines/Inkling-Small:peft:262144", name: "Inkling Small PEFT (Tinker)", desc: "Thinking Machines Inkling Small model (256k context window)." },
  { id: "Qwen/Qwen3.6-35B-A3B", name: "Qwen 3.6 35B (Tinker)", desc: "Qwen 3.6 35B A3B model via Tinker." },
  { id: "openai/gpt-audio-1.5", name: "GPT Audio 1.5 (OpenAI)", desc: "OpenAI multimodal model with native audio input & audio output capabilities." },
  { id: "openai/gpt-audio-2025-08-28", name: "GPT Audio 2025-08-28 (OpenAI)", desc: "Pinned GPT Audio snapshot for text and audio conversations." },
  { id: "openai/gpt-4o-audio-preview", name: "GPT-4o Audio Preview (OpenAI)", desc: "OpenAI flagship model supporting native audio inputs and speech outputs." },
  { id: "openai/gpt-4o-mini-audio-preview", name: "GPT-4o Mini Audio Preview (OpenAI)", desc: "Fast lightweight OpenAI audio-capable model." },
  { id: "openai/o3-mini", name: "o3-mini (OpenAI Reasoning)", desc: "OpenAI high-speed reasoning model with configurable reasoning effort." },
  { id: "openai/o1", name: "o1 (OpenAI Reasoning)", desc: "OpenAI flagship reasoning model with deep thought processing." },
  { id: "openai/gpt-4o", name: "GPT-4o", desc: "OpenAI Gold Standard conversational model." },
  { id: "openai/gpt-4.1", name: "GPT-4.1", desc: "OpenAI model enhanced for code and longer context." },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (OpenRouter)", desc: "Anthropic flagship reasoning & code model." },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1 (OpenRouter)", desc: "Open-weights reasoning model with explicit chain of thought." },
  { id: "cohere/command-r-plus", name: "Command R+", desc: "Optimized for retrieval, RAG, and complex reasoning" },
  { id: "mistralai/mistral-large-2407", name: "Mistral Large 2", desc: "Top-tier European reasoning model with multilingual expertise" },
  { id: "microsoft/phi-3-medium-128k-instruct", name: "Phi-3 Medium", desc: "High-quality, lightweight 128k-context model" }
];

export const DEFAULT_PERSONAS: PersonaPreset[] = [
  {
    id: "riffer",
    name: "Riffer & Collaborator",
    description: "An elastic, conversational groove companion. Refines concepts incrementally, asks brilliant questions, and coordinates ideas.",
    defaultMode: "Riff",
    prompt: `You are a creative collaborative shell. Do not just deliver answers— riff on what is provided.
Propose unusual alternatives, stretch the constraints, and ask a single high-leverage question at the end of each turn to push the design forward.`
  }
];

export const DEFAULT_MEMORIES: Memory[] = [];

export const INITIAL_SPACES: Space[] = [
  {
    id: "space-1780423024943",
    name: "Default Space",
    description: "",
    notes: "",
    model: "openai/gpt-4o",
    temperature: 0.75,
    top_p: 0.96,
    max_tokens: 4096,
    systemPromptPresetId: "riffer",
    systemPromptCustom: "You are a creative collaborative shell. Do not just deliver answers— riff on what is provided.\nPropose unusual alternatives, stretch the constraints, and ask a single high-leverage question at the end of each turn to push the design forward.",
    threads: [
      {
        id: "thread-1780423024943",
        title: "New Conversation",
        createdAt: "2026-06-02T17:57:04.943Z",
        messages: [
           
        ]
      }
    ],
    activeThreadId: "thread-1780423024943",
    pinnedMemoryIds: [],
    tinkerReasoningEffort: "high",
    tinkerWebSearch: false,
    tinkerShowThinking: false,
    enableThinkingLogs: false,
    includeCoTInContext: false,
    presence_penalty: 0.0,
    frequency_penalty: 0.0,
    service_tier: "auto"
  }
];
