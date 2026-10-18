---
name: component-patterns
description: Use when designing reusable UI component APIs, composition patterns, or building component libraries.
---

# Component Patterns

## When to Use This Skill
- Designing component APIs for a new library or design system
- Deciding between composition patterns (render props, slots, HOCs, hooks)
- Building compound components with shared state
- Refactoring component interfaces for better ergonomics

## Workflow
1. Identify the component's single responsibility — what one thing does it do
2. Define the public API surface: props, events, slots, and exposed methods
3. Choose a composition pattern based on complexity: props for simple cases, render props/slots for flexible rendering, hooks for shared logic
4. Implement compound components if the component has internal sub-parts that need coordination
5. Add TypeScript types for all props and return values
6. Write usage examples for the common cases and edge cases
7. Document accessibility requirements and keyboard navigation

## Rules
- Keep the API surface minimal — don't add props for every possible variation
- Use sensible defaults so the common case requires zero configuration
- Never break existing prop interfaces without a major version bump
- Prefer controlled components over internal state when the parent needs access
- Test with both mouse and keyboard interaction
