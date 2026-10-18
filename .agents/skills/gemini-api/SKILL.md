---
name: gemini-api
description: Use when building applications with Google's Gemini API. Covers multimodal inputs, function calling, streaming, and safety settings.
---

# Gemini API

## When to Use This Skill
- Building apps that use Gemini's multimodal capabilities
- Implementing function calling with Gemini models
- Setting up streaming responses
- Configuring safety settings and content filtering
- Prompting Gemini for optimal results

## Workflow
1. Set up authentication with a Google AI API key
2. Choose the appropriate Gemini model variant for your use case
3. Configure the client library and initialize the model
4. Build prompts that handle text, images, or other modalities as needed
5. Implement function calling by defining tool schemas
6. Set up streaming for long-running generations
7. Tune safety settings based on your content policy requirements
8. Test with edge cases including multi-turn conversations

## Rules
- Never hardcode API keys in source code
- Handle rate limits with exponential backoff
- Validate model responses before passing to downstream systems
- Use structured outputs when you need deterministic parsing
- Respect token limits for each model variant
- Document which model version your app depends on
