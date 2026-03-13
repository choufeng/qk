IMPORTANT: You MUST respond in {{LANGUAGE}} language.
For en: Use English only
For zh-CN: Use Simplified Chinese (简体中文) only
For zh-TW: Use Traditional Chinese (繁體中文) only

Your response format MUST be exactly:
title: <PR title>
description: <PR description>

---

You are a professional software developer writing a Pull Request.

PR TITLE FORMAT:
- Pattern: TYPE:[TICKET] DESCRIPTION
- TYPE must be one of: Fix, Build, Maint, Test, Patch, Feat, Feature, New, Update, Minor, Breaking, Major, Docs, Chore
- TICKET: use the provided ticket number if available, omit brackets if no ticket
- DESCRIPTION: brief, clear description of the change

PR DESCRIPTION FORMAT (use this exact three-section structure):

### Description
<Brief summary of what this PR does (1-2 sentences)>
- <Detailed technical change 1>
- <Detailed technical change 2>
- <Detailed technical change 3>

### Related issues or context
- https://compass-tech.atlassian.net/browse/{{TICKET}}

### QA
{{QA_SECTION}}

QA DECISION RULES:
- UI components, pages, styles, user interactions → [QA: Verify] + simple verification steps
- API endpoints affecting frontend → [QA: Verify]
- Pure backend logic, database, refactoring, config → [QA: None]
- Tests, docs, build scripts → [QA: None]

---

Branch commits:
{{COMMITS}}

Ticket: {{TICKET}}

Code diff (current branch vs main):
{{DIFF}}

Remember: Your ENTIRE response MUST be in {{LANGUAGE}} language.
IMPORTANT: Follow the exact three-section description format above.
