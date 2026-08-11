# Requirements Document

## Introduction

This feature adds an AI chat capability to the generated Vedic astrology report view. After a report is produced for a chart, a user can open a conversational panel and ask follow-up questions about that report. The user selects one or more analysis agents (for example, the Health Analysis agent or the Career Analysis agent) from the UI, and follow-up questions are answered only by the selected agent(s). Unselected agents are not invoked, keeping follow-up conversations focused, faster, and lower in cost.

The chat reuses the already-generated report context (the consolidated findings and domain outputs from the completed pipeline run) plus the selected domain agent's prompt/persona, instead of re-running the full multi-wave analysis pipeline. Responses stream to the UI, and the conversation is persisted so it can be reloaded with the report.

This document defines the requirements for the chat interface, agent-selection control, selective routing, report-context reuse, persistence, and streaming behavior.

## Glossary

- **Report_Chat**: The overall feature enabling conversation about a generated report.
- **Chat_Panel**: The client-side UI surface, embedded in the report view, where the user reads messages, types questions, and sees streamed responses.
- **Agent_Selector**: The client-side UI control that lets the user choose one or more domain analysis agents for the conversation.
- **Domain_Agent**: A selectable analysis agent identified by an agent ID and domain, drawn from the existing agent catalogue. Selectable domain agents are: Wealth (`2C`), Property (`2D`), Health (`2E`), Career (`2F`), and Marriage (`2G`).
- **Chat_Service**: The server-side component that receives a chat request, assembles context, invokes selected Domain_Agents through the existing LLM wrapper, and streams the response.
- **Chat_Router**: The logic within the Chat_Service that determines which Domain_Agents handle a given message based on the user's selection.
- **Report_Context**: The read-only data derived from a completed pipeline run for a chart, including the consolidated fact summary and relevant domain outputs, used as grounding for chat answers.
- **Chat_Store**: The persistence layer that stores chat sessions and messages tied to a chart and its report run.
- **Chat_Session**: A persisted conversation associated with one chart's report run, containing an ordered list of Chat_Messages and the set of selected Domain_Agents.
- **Chat_Message**: A single persisted entry in a Chat_Session, with a role (`user` or `assistant`), text content, an optional originating Domain_Agent identifier, and a creation timestamp.
- **Report_Run**: A completed pipeline run (status `done`) that produced a report for a chart.
- **LLM_Wrapper**: The existing single provider-agnostic model-call module (`engine/llm.ts`) through which all model calls are made.

## Requirements

### Requirement 1: Report Chat Interface

**User Story:** As a user viewing a generated report, I want a chat panel on the report view, so that I can ask follow-up questions about my report conversationally.

#### Acceptance Criteria

1. WHERE a Report_Run has status `done`, THE Chat_Panel SHALL be available on that report's view.
2. WHERE a Report_Run has not reached status `done`, THE Chat_Panel SHALL display a disabled state indicating that chat becomes available after the report is generated.
3. WHEN the user submits a non-empty message in the Chat_Panel, THE Chat_Panel SHALL display the submitted message in the conversation with role `user`.
4. WHEN the Chat_Service returns an assistant response, THE Chat_Panel SHALL display the response in the conversation with role `assistant`.
5. IF the user submits a message containing only whitespace, THEN THE Chat_Panel SHALL reject the submission and retain the entered text for editing.
6. WHILE a response is being generated, THE Chat_Panel SHALL disable the message submission control until the response completes or fails.

### Requirement 2: Agent Selection Control

**User Story:** As a user, I want to choose which analysis agent(s) handle my conversation, so that follow-up questions are answered only by the domains I care about.

#### Acceptance Criteria

1. THE Agent_Selector SHALL present the selectable Domain_Agents defined in the Glossary: Wealth, Property, Health, Career, and Marriage.
2. THE Agent_Selector SHALL allow the user to select one or more Domain_Agents at the same time.
3. WHEN the user changes the Domain_Agent selection, THE Agent_Selector SHALL apply the updated selection to subsequent messages in the Chat_Session.
4. WHERE a Chat_Session has a persisted Domain_Agent selection, THE Agent_Selector SHALL restore that selection when the report view is reopened.
5. IF the user submits a message while no Domain_Agent is selected, THEN THE Chat_Panel SHALL block the submission and prompt the user to select at least one Domain_Agent.

### Requirement 3: Selective Follow-up Routing

**User Story:** As a user, I want follow-up questions routed only to my selected agent(s), so that the system does not invoke every agent and my responses stay focused, faster, and cheaper.

#### Acceptance Criteria

1. WHEN the user submits a message, THE Chat_Router SHALL invoke only the Domain_Agents in the current selection.
2. WHEN the user submits a message, THE Chat_Router SHALL NOT invoke any Domain_Agent that is absent from the current selection.
3. WHERE exactly one Domain_Agent is selected, THE Chat_Service SHALL produce the response using only that Domain_Agent's prompt and persona.
4. WHERE more than one Domain_Agent is selected, THE Chat_Service SHALL produce a response that attributes content to each contributing Domain_Agent by its domain name.
5. WHEN the Chat_Service invokes a Domain_Agent, THE Chat_Service SHALL route the call through the LLM_Wrapper.

### Requirement 4: Report Context Reuse

**User Story:** As a user, I want the chat to use my already-generated report as context, so that answers are grounded in my chart without re-running the full analysis pipeline.

#### Acceptance Criteria

1. WHEN the Chat_Service handles a message, THE Chat_Service SHALL assemble Report_Context from the completed Report_Run associated with the report.
2. THE Chat_Service SHALL include, in the prompt sent to a selected Domain_Agent, the Report_Context and the selected Domain_Agent's prompt.
3. THE Chat_Service SHALL include the prior Chat_Messages of the current Chat_Session in the prompt sent to the selected Domain_Agent.
4. WHEN the Chat_Service handles a message, THE Chat_Service SHALL NOT execute the Wave 1 through Wave 4 pipeline agents that are outside the current Domain_Agent selection.
5. IF the associated Report_Run has no consolidated report output available, THEN THE Chat_Service SHALL return an error response indicating that chat requires a completed report.

### Requirement 5: Chat History Persistence

**User Story:** As a user, I want my conversation saved with the report, so that I can return later and continue where I left off.

#### Acceptance Criteria

1. WHEN the user submits a message, THE Chat_Store SHALL persist a Chat_Message with role `user` linked to the Chat_Session for the report's chart and Report_Run.
2. WHEN the Chat_Service completes an assistant response, THE Chat_Store SHALL persist a Chat_Message with role `assistant`, the response content, and the originating Domain_Agent identifier, linked to the same Chat_Session.
3. WHEN the user opens the report view, THE Chat_Panel SHALL load and display the persisted Chat_Messages of the Chat_Session in ascending creation-timestamp order.
4. THE Chat_Store SHALL persist the current set of selected Domain_Agents for the Chat_Session.
5. IF an assistant response fails before completion, THEN THE Chat_Store SHALL NOT persist a partial assistant Chat_Message for that failed response.

### Requirement 6: Streaming Responses

**User Story:** As a user, I want responses to appear incrementally as they are produced, so that I get feedback quickly instead of waiting for the whole answer.

#### Acceptance Criteria

1. WHEN the Chat_Service produces an assistant response, THE Chat_Service SHALL stream response content to the Chat_Panel incrementally as it is generated.
2. WHILE a response is streaming, THE Chat_Panel SHALL append each received content increment to the in-progress assistant message.
3. WHEN the response stream completes, THE Chat_Service SHALL send a completion signal to the Chat_Panel.
4. IF the response stream terminates before a completion signal is received, THEN THE Chat_Panel SHALL display an error state for the in-progress message and re-enable the message submission control.

### Requirement 7: Chat Error Handling

**User Story:** As a user, I want clear feedback when something goes wrong, so that I understand the failure and can retry.

#### Acceptance Criteria

1. IF a call to the LLM_Wrapper fails while handling a message, THEN THE Chat_Service SHALL return an error response identifying that the response could not be generated.
2. WHEN the Chat_Service returns an error response, THE Chat_Panel SHALL display an error message and re-enable the message submission control.
3. IF a chat request references a Chat_Session or Report_Run that does not exist, THEN THE Chat_Service SHALL return a not-found error response.
4. WHEN a message submission fails, THE Chat_Panel SHALL retain the user's entered text so that the user can resubmit it.
