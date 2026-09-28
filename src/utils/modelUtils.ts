/**
 * Utility functions for identifying model providers and reasoning capabilities.
 */

export function isOpenAIModel(model?: string): boolean {
  if (!model) return false;
  const m = model.toLowerCase().trim();
  return (
    m.startsWith("openai/") ||
    m.startsWith("gpt-") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4") ||
    m.includes("luna") ||
    m.startsWith("chatgpt-")
  );
}

export function isGpt4Model(model?: string): boolean {
  if (!model) return false;
  const m = model.toLowerCase().trim();
  return m.includes("gpt-4");
}

export function isOpenAINonGpt4Model(model?: string): boolean {
  if (!model) return false;
  return isOpenAIModel(model) && !isGpt4Model(model) && !model.toLowerCase().includes('gpt-audio');
}

export function isInklingModel(model?: string): boolean {
  if (!model) return false;
  const m = model.toLowerCase().trim();
  return (
    m.startsWith("thinkingmachines/") ||
    m.includes("inkling") ||
    m.startsWith("qwen/qwen3.6")
  );
}

export function isGeminiModel(model?: string): boolean {
  if (!model) return false;
  const m = model.toLowerCase().trim();
  return (
    m.startsWith("gemini") ||
    m.startsWith("google/gemini") ||
    m.includes("gemini")
  );
}

/**
 * Checks if the model should have Inkling/Gemini-style reasoning logic applied.
 * This applies to Inkling/Tinker models, Gemini 3 series models, AND all OpenAI models EXCEPT GPT-4x models.
 */
export function shouldApplyReasoningLogic(model?: string): boolean {
  if (!model) return false;
  return isInklingModel(model) || isOpenAINonGpt4Model(model) || isGeminiModel(model);
}

/**
 * Maps reasoning effort to OpenAI-compatible values ('low' | 'medium' | 'high' or undefined)
 */
export function mapOpenAIReasoningEffort(effort?: string): 'low' | 'medium' | 'high' | undefined {
  if (!effort) return undefined;
  const e = effort.toLowerCase().trim();
  if (e === 'none') return undefined;
  if (e === 'minimal') return 'low';
  if (e === 'xhigh') return 'high';
  if (e === 'low' || e === 'medium' || e === 'high') return e;
  return 'high';
}
