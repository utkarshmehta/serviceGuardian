# Service Guardian 🛡️

**An autonomous AI agent that lives inside your infrastructure, monitors your services, and fixes production issues in seconds.**

> "Don't just observe your service. Guard it."

![Architecture](architecture.mermaid)

(Note: You can view the architecture diagram by pasting the content of `architecture.mermaid` into [Mermaid Live](https://mermaid.live))

## 📖 The Concept: Service Guardian Pattern

Traditional SRE involves a human reacting to a passive dashboard. The **Service Guardian** completely inverts this model.

It is an active, autonomous agent that:
1.  **Listens** to your service's alerts (Webhooks/Events).
2.  **Investigates** the root cause by reading source code and logs (via MCP).
3.  **Reasons** about the failure using high-speed LLMs (Gemini 2.5 Flash).
4.  **Acts** to resolve the issue (Files JIRA tickets, posts Slack summaries, or even patches code).

This project is a reference implementation of a Service Guardian built for a Node.js Analytics Service.

## 🏗️ Architecture

The system relies on the **Model Context Protocol (MCP)** to give the AI "Hands" and **Google Gemini 2.5 Flash** to give it a "Brain".

*   **Brain**: `Google Gemini 2.5 Flash`. Chosen for its massive context window (to read huge log files/codebases) and sub-second latency.
*   **Hands**: `Model Context Protocol (MCP)`.
    *   `filesystem-mcp`: For reading source code and grepping logs.
    *   `atlassian-mcp`: For searching and creating JIRA tickets.
    *   `slack-mcp`: For communicating with the team.
*   **Body**: `Node.js`. A lightweight event loop that orchestrates the tool calls and ensures safety (preventing infinite loops).

### workflow

1.  **Alert Trigger**: The service throws a 500 Error. A webhook hits the Guardian.
2.  **Context Assembly**: The Guardian pulls the stack trace and recent git history.
3.  **Forensic Analysis**: It uses `grep` to locate the crashing file and reads the code.
4.  **Determination**: It identifies the bug (e.g., "Missing semicolon in `db.connect()`").
5.  **Resolution**: It files a fully formatted JIRA ticket with the fix and notifies the #sre channel.

**Total Time:** < 45 seconds.

## 🚀 Technical Highlights

*   **Autonomous "YOLO" Mode**: The agent runs a continuous "OODA Loop" (Observe, Orient, Decide, Act) until the goal is met.
*   **Safety Governors**: Built-in state machine prevents the agent from getting stuck in infinite loops.
*   **Real-time Stream**: The "Consciousness" of the agent is streamed via WebSocket to a dashboard, allowing engineers to watch its thought process live (Matrix-style).

## 🛠️ Setup & Usage

### Prerequisites
*   Node.js v16+
*   Gemini API Key
*   Access to an MCP-compatible Atlassian/Slack instance (optional for local demo)

### Installation

```bash
git clone https://github.com/utkarshmehta/serviceGuardian.git
cd serviceGuardian
npm install
```

### Running the Guardian

```bash
# Start the Guardian Agent
node sre-agent.js
```

The UI will be available at `http://localhost:3000`.

## 📂 Repository Structure

*   `sre-agent.js`: The core agent logic and orchestrator.
*   `services/`: Example target services (the "victim" services we break).
*   `public/`: The "Matrix-style" frontend dashboard.
*   `architecture.mermaid`: Detailed system diagram.

## 🤝 Contributing

This is a proof-of-concept for the Service Guardian pattern. Pull requests to add new MCP servers (PagerDuty, Datadog, GitHub) are welcome!

## 📜 License

MIT

---
*Built with ❤️ by Utkarsh Mehta*
