import type { Prompt } from "./models/prompt";
import { ensureVariableDefinitions } from "./promptCompiler/compiler";
import { nowIso } from "./utils/id";

function createSeedPrompt(input: {
  id: string;
  title: string;
  command: string;
  aliases: string[];
  tags: string[];
  description: string;
  content: string;
  variantSuffix: string;
  variantName: string;
  variantContent: string;
}): Prompt {
  const createdAt = nowIso();
  const variables = ensureVariableDefinitions(`${input.content}\n${input.variantContent}`);
  return {
    id: input.id,
    title: input.title,
    command: input.command,
    aliases: input.aliases,
    tags: input.tags,
    description: input.description,
    defaultVersionId: "v1",
    versions: [
      {
        id: "v1",
        promptId: input.id,
        label: "Original",
        content: input.content,
        changelog: "Seed prompt",
        createdAt,
        createdBy: "local user",
        isDefault: true
      }
    ],
    variants: [
      {
        id: `${input.id}_${input.variantSuffix}`,
        promptId: input.id,
        name: input.variantName,
        suffix: input.variantSuffix,
        content: input.variantContent,
        description: `${input.variantName} alternative`,
        createdAt,
        updatedAt: createdAt
      }
    ],
    variables,
    createdAt,
    updatedAt: createdAt,
    usageCount: 0
  };
}

export const seedPrompts: Prompt[] = [
  createSeedPrompt({
    id: "paper-reading",
    title: "Paper Reading Framework",
    command: "/paper-reading",
    aliases: ["/paper", "/read-paper"],
    tags: ["research", "papers"],
    description: "Analyze a research paper with claims, evidence, limitations, and follow-up questions.",
    content:
      "Read the following paper text and produce a structured research brief.\n\nPaper text:\n{{paper_text}}\n\nFocus area: {{project_context}}\nCitation style: {{citation_style}}\n\nReturn sections for thesis, methods, key claims, evidence quality, limitations, and questions to investigate next.",
    variantSuffix: "short",
    variantName: "Short",
    variantContent:
      "Summarize this paper in 8 bullets for a busy researcher.\n\nPaper text:\n{{paper_text}}\n\nMention the main claim, method, strongest evidence, weakest evidence, and one follow-up question."
  }),
  createSeedPrompt({
    id: "blog-evolution",
    title: "Blog Evolution",
    command: "/blog-evolution",
    aliases: ["/blog", "/evolve-blog"],
    tags: ["writing", "blog"],
    description: "Turn notes into a sharper blog outline and draft direction.",
    content:
      "Use these notes to evolve a blog post for {{audience}}.\n\nNotes:\n{{project_context}}\n\nTone: {{tone}}\nOutput format: {{output_format}}\n\nReturn a strong thesis, outline, opening hook, and revision risks.",
    variantSuffix: "long",
    variantName: "Long",
    variantContent:
      "Create a detailed long-form blog plan for {{audience}} from these notes:\n\n{{project_context}}\n\nInclude thesis, title options, section outline, examples, objections, and a closing arc."
  }),
  createSeedPrompt({
    id: "coding-agent-prod",
    title: "Coding Agent Production Brief",
    command: "/coding-agent-prod",
    aliases: ["/coding-prod", "/agent-prod"],
    tags: ["engineering", "agents"],
    description: "Brief a coding agent with production constraints and verification expectations.",
    content:
      "Act as a senior engineer. Implement the requested change in a production-grade way.\n\nTask:\n{{task}}\n\nProject context:\n{{project_context}}\n\nConstraints:\n- Keep changes scoped.\n- Preserve existing behavior unless explicitly changed.\n- Add or update tests for risky logic.\n- Explain verification performed.",
    variantSuffix: "prod",
    variantName: "Prod",
    variantContent:
      "Production implementation request:\n{{task}}\n\nContext:\n{{project_context}}\n\nPrioritize maintainability, small blast radius, user-friendly errors, and concrete test coverage."
  }),
  createSeedPrompt({
    id: "research-critique",
    title: "Research Critique",
    command: "/research-critique",
    aliases: ["/critique-research"],
    tags: ["research", "critique"],
    description: "Critique research claims with assumptions, counterexamples, and missing controls.",
    content:
      "Critique the following research argument.\n\nArgument or paper excerpt:\n{{paper_text}}\n\nContext:\n{{project_context}}\n\nReturn assumptions, methodological risks, plausible counterarguments, missing evidence, and a fair revised claim.",
    variantSuffix: "academic",
    variantName: "Academic",
    variantContent:
      "Provide an academic critique of this excerpt using {{citation_style}} style where citations are needed:\n\n{{paper_text}}\n\nFocus on validity, novelty, generalizability, and confounders."
  }),
  createSeedPrompt({
    id: "summarize-chapter",
    title: "Summarize Chapter",
    command: "/summarize-chapter",
    aliases: ["/chapter-summary"],
    tags: ["reading", "summary"],
    description: "Summarize a book chapter into notes and reusable takeaways.",
    content:
      "Summarize this chapter for {{audience}}.\n\nChapter text:\n{{chapter_text}}\n\nOutput format: {{output_format}}\n\nInclude a concise summary, key ideas, memorable passages, open questions, and actions.",
    variantSuffix: "notes",
    variantName: "Notes",
    variantContent:
      "Convert this chapter into study notes:\n\n{{chapter_text}}\n\nUse headings, bullets, definitions, and questions for later review."
  })
];
