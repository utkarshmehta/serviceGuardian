# Service Guardian

**An autonomous agent that monitors infrastructure, investigates root causes, and resolves production incidents without human intervention.**
![Uploading image.png…]()

## Overview

The Service Guardian represents a shift from passive monitoring to active stewardship. Unlike traditional automation scripts, this agent possesses reasoning capabilities allowing it to navigate unforeseen error states, analyze source code context, and execute complex remediation workflows autonomously.

Architecture Diagram

<img width="1142" height="783" alt="image" src="https://github.com/user-attachments/assets/f61c966b-61ed-48b0-a879-d512b8ce4f76" />


(Note: Render the architecture diagram using [Mermaid Live](https://mermaid.live))

## Live Demonstration

The following demonstration shows the agent detecting a critical database failure, identifying a syntax error in the source code, and filing a comprehensive JIRA ticket—all in under 45 seconds.

![Service Guardian Demo](demo_gif_latest.gif)

## The Service Guardian Pattern

In modern distributed systems, the "Mean Time to Resolution" (MTTR) is often dominated by context switching and manual investigation. The Service Guardian pattern aims to eliminate this latency by embedding an intelligent agent directly into the operational loop.

The agent operates on a continuous feedback loop:
1.  **Observation**: Listens for high-fidelity signals (Webhooks, Error Streams).
2.  **Orientation**: Gathering context via forensic analysis of logs, recent commits, and source code.
3.  **Decision**: Leveraging Large Language Model (LLM) reasoning to determine the root cause.
4.  **Action**: Executing remediations using standardized interfaces (JIRA, Slack, CI/CD).

## Architecture

This project is built on three core pillars:

### 1. The Reasoning Core (Google Gemini 2.5 Flash)
We utilize Gemini 2.5 Flash for its high throughput and extended context window. This allows the agent to ingest entire file trees and long log streams in a single inference pass, enabling "YOLO Mode" detection where the agent can spot correlations that human operators might miss.

### 2. The Interface Layer (Model Context Protocol)
To interact with the external world, the agent uses the **Model Context Protocol (MCP)**. This creates a standardized abstraction layer between the AI and the infrastructure.
*   **Filesystem MCP**: Provides read/grep capabilities for forensic code analysis.
*   **Atlassian MCP**: Manages lifecycle of incident tickets in JIRA.
*   **Slack MCP**: Handles team communication and broadcasting.

### 3. The Orchestrator (Node.js)
A lightweight Node.js event loop manages the agent's lifecycle, ensuring operational safety through step governors and state management.

## Setup & Usage

### Prerequisites
*   Node.js v16+
*   Google Gemini API Key
*   Access to MCP-compatible tool servers

### Installation

```bash
git clone https://github.com/utkarshmehta/serviceGuardian.git
cd serviceGuardian
npm install
```

### Running the Agent

```bash
# Start the Service Guardian
node sre-agent.js
```

The operational dashboard will be accessible at `http://localhost:3000`.

## License

MIT License
