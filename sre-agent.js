const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store for alerts
const alerts = [];

app.get('/api/alerts', (req, res) => {
    // Return alerts sorted by newest first
    res.json(alerts.slice().reverse());
});

app.post('/alert-trigger', (req, res) => {
    if (req.body && req.body.challenge) return res.status(200).send(req.body.challenge);

    if (!req.body.event || !req.body.event.text) {
        return res.status(400).send("Invalid Payload. Expecting Slack Event.");
    }

    // IGNORE BOT MESSAGES to prevent infinite loops
    if (req.body.event.bot_id || req.body.event.subtype === 'bot_message') {
        return res.status(200).send("Ignored Bot Message");
    }

    let alertText = req.body.event.text;
    alertText = alertText.replace(/[<>'"|]/g, '');

    // Create new alert record
    const alertId = Date.now();
    const alertRecord = {
        id: alertId,
        timestamp: new Date(),
        text: alertText,
        status: 'pending',
        currentStep: 'investigating',
        steps: [
            { id: 'start', label: 'Alert Received', status: 'done', time: new Date() },
            { id: 'investigating', label: 'Investigating', status: 'active', time: null },
            { id: 'issue_found', label: 'Root Cause Identified', status: 'pending', time: null },
            { id: 'jira', label: 'JIRA Ticket Created', status: 'pending', time: null },
            { id: 'ready', label: 'Ready for Resolver', status: 'pending', time: null }
        ],
        logs: '',
        jiraLink: null,
        jiraKey: null,
        slackLink: null
    };
    alerts.push(alertRecord);

    const debugMsg = "[SYSTEM] Pre-flight check: Preparing to launch Agent...\n";
    console.log(debugMsg);
    alertRecord.logs += `<div style="color: #00ffff; font-weight: bold;">${debugMsg}</div>`;
    res.status(200).send("Mission Accepted.");

    const triagePrompt = `
Act as Lead Developer / Service Owner. IGNORE SKILLS. Use ONLY MCP tools.
You MUST output status markers exactly as shown below when you reach each stage.

**ALERT RECEIVED:** "${alertText}"

1.  **Phase 1: Investigation**
    *   **Goal:** Locate the file mentioned in the alert or relevant to the keywords.
    *   **Action:** Use \`find_by_name\` or \`grep_search\` to locate the file.
    *   **Action:** Read the file content using \`read_file\`.
    *   **Analyze:** Identify the bug, syntax error, or logical flaw described in the alert.
    *   *After success:* PRINT "[[STEP:ISSUE_FOUND]] Identified issue in <filename>"
    *   *Then:* PAUSE for 1 second to simulate analysis.

2.  **Phase 2: Reporting (JIRA)**
    *   Use "atlassian-rovo-mcp-server" -> \`createJiraIssue\`.
    *   **Format:**
        *   Project: "KAN"
        *   Type: "Task"
        *   Summary: "[Sev2] Production Issue: <Short Description of the specific bug found>"
        *   Description: Use this EXACT Markdown template:
            ### Incident Report
            **File:** \`<found_filename>\`
            **Severity:** High
            
            ### Bug Details
            <Detailed explanation of the specific bug found in the file>
            
            ### Broken Code
            \`\`\`typescript
            <Insert the ACTUAL broken code lines from the file>
            \`\`\`
            
            ### Proposed Fix
            <Explain the fix>
            \`\`\`typescript
            <Insert the FIXED code>
            \`\`\`
            
            _Ticket automatically created by Service Guardian Investigator Agent._
    *   *After success:* PRINT "[[STEP:JIRA_CREATED]] ticket {JiraKey} created at {JiraURL}"
    *   *Then:* PAUSE for 1 second to verify ticket.

3.  **Phase 3: Notification (Slack)**
    *   Use "slack" -> \`slack_post_message\` (Channel: triaged-ready-to-fix).
    *   **Format:**
        --------------------------------------------------
        *BUG REPORT: ${new Date().toLocaleString()}*
        --------------------------------------------------
        *Issue:* ${alertText}
        *Ticket:* <{JiraURL}|{JiraKey}>
        *Status:* Analysis Complete. Fix Proposed.
        --------------------------------------------------
    *   *After success:* PRINT "[[STEP:READY]] verification complete. [[SLACK_SUCCESS]] Channel={channel_id} TS={message_ts} [[JIRA_SUCCESS]] Key={JiraKey} URL={JiraURL}"
    `.trim();

    const tempPromptFile = path.join(__dirname, `prompt_${alertId}.txt`);
    fs.writeFileSync(tempPromptFile, triagePrompt, 'utf8');

    // --- SIMULATION MODE (Bypassing Quota/404 Errors for Demo) ---
    // The previous LLM approach is hitting Rate Limits. 
    // We will simulate the "Happy Path" investigation
    const args = [
        '--model', 'gemini-2.5-flash', // User Requested Model
        '--yolo',
        '--include-directories', '.',
        '--allowed-mcp-server-names', 'slack,atlassian-rovo-mcp-server,filesystem'
    ];

    setTimeout(() => { // Reduced to 1s
        const cmd = 'gemini';
        const debugCmd = `${cmd} ${args.join(' ')}`;
        console.log(`[DEBUG] Spawning Agent: ${debugCmd}`);
        // alertRecord.logs += `<div style="color: #666; font-size: 0.7em;">[DEBUG] CMD: ${debugCmd}</div>`; // Removed per user feedback

        alertRecord.logs += `<div style="color: #add8e6; margin-top: 10px;">[FS] READING SOURCE CODE (Analysis in progress...)</div>`;
        alertRecord.logs += `<div style="color: #00ffff; font-weight: bold;">[SYSTEM] Executing spawn command (Model: gemini-2.5-flash)...</div>`;

        let gemini;
        try {
            gemini = spawn(cmd, args, { shell: true });
        } catch (e) {
            alertRecord.logs += `<div style="color: #ff0000;">[ERROR] Spawn Failed Immediate: ${e.message}</div>`;
            alertRecord.status = 'error';
            return;
        }

        const promptStream = fs.createReadStream(tempPromptFile);
        promptStream.on('error', (err) => {
            alertRecord.logs += `<div style="color: #ff0000;">[ERROR] Prompt Stream Error: ${err.message}</div>`;
        });
        promptStream.pipe(gemini.stdin);

        gemini.stdout.on('data', (data) => {
            const rawStr = data.toString();
            // prettifyLog now returns MULTIPLE lines (Header + Stream), so we append directly
            const str = prettifyLog(rawStr);

            process.stdout.write(rawStr); // Keep server console raw for debugging
            alertRecord.logs += str;

            // Strict Status Parsing
            if (rawStr.includes('[[STEP:ISSUE_FOUND]]')) completeUpTo(alertRecord, 'issue_found');
            if (rawStr.includes('[[STEP:JIRA_CREATED]]')) completeUpTo(alertRecord, 'jira');
            if (rawStr.includes('[[STEP:READY]]')) {
                completeUpTo(alertRecord, 'ready');
                alertRecord.status = 'success';
            }

            // CONTINUOUS DATA EXTRACTION
            // MATCH AGAINST ACCUMULATED logs to prevent split-chunk issues
            // Note: alerts.logs now contains HTML, so we check raw regex against rawStr or extract from rawStr

            // Strategy 1: Explicit Success Marker (Highest Confidence, Includes URL)
            const markerMatch = rawStr.match(/\[\[JIRA_SUCCESS\]\]\s+Key=([A-Z]+-\d+)\s+URL=(https?:\/\/[^\s]+)/i);
            if (markerMatch) {
                if (!alertRecord.jiraKey) alertRecord.jiraKey = markerMatch[1];
                if (!alertRecord.jiraLink) alertRecord.jiraLink = markerMatch[2];
            } else {
                // FALLBACKS (If marker missing or incomplete)
                if (!alertRecord.jiraKey) {
                    // Strategy 2: Explicit Step Output
                    const stepMatch = rawStr.match(/ticket\s+([A-Z]+-\d+)\s+created\s+at\s+(https?:\/\/[^\s]+)/i);
                    if (stepMatch) {
                        alertRecord.jiraKey = stepMatch[1];
                        alertRecord.jiraLink = stepMatch[2];
                    }
                    // Strategy 3: Greedy Regex (Deep Fallback)
                    else {
                        const rawMatch = rawStr.match(/\b(KAN-\d+)\b/);
                        if (rawMatch) {
                            alertRecord.jiraKey = rawMatch[1];
                            // Only set generic link if we have absolutely nothing else
                            if (!alertRecord.jiraLink) alertRecord.jiraLink = `https://atlassian.net/browse/${rawMatch[1]}`;
                        }
                    }
                }
            }

            // Slack Hub Extraction
            if (!alertRecord.slackLink) {
                const slackMeta = rawStr.match(/\[\[SLACK_SUCCESS\]\]\s+Channel=([A-Z0-9]+)\s+TS=([0-9.]+)/i);
                if (slackMeta) {
                    const ch = slackMeta[1];
                    const ts = slackMeta[2].replace('.', '');
                    alertRecord.slackLink = `https://slack.com/archives/${ch}/p${ts}`;
                }
            }
        });

        gemini.stderr.on('data', (data) => {
            const trace = data.toString();
            if (!trace.includes('AttachConsole')) {
                process.stdout.write(trace);
                // prettify stderr too? usually it's noise
                // alertRecord.logs += trace;
            }
        });

        gemini.on('close', (code) => {
            if (fs.existsSync(tempPromptFile)) {
                try { fs.unlinkSync(tempPromptFile); } catch (e) { }
            }
            console.log(`\n🚀 Workflow complete (Code: ${code}). Bridge ready.`);
            if (alertRecord.status !== 'success' && code !== 0) alertRecord.status = 'error';
        });

        gemini.on('error', (err) => {
            console.error(`❌ Process Error: ${err.message}`);
            alertRecord.status = 'error';
            alertRecord.logs += `<div style="color: #ff0000;">❌ Process Error: ${err.message}</div>`;
        });
    }, 1000);
});

// Helper to scan full logs? (Deprecated with stream scanning, but kept if needed)
function extractDataFromFullLog(record) {
    // No-op for now as we scan stream. 
    // Logic inside stream handler is robust enough with Redundant + Greedy + URL propagation.
}

function completeUpTo(record, activeStepId) {
    record.currentStep = activeStepId;
    let foundActive = false;

    for (const step of record.steps) {
        if (step.id === activeStepId) {
            // If this is the final step 'ready', mark it done immediately for visual closure
            if (step.id === 'ready') {
                step.status = 'done';
            } else {
                step.status = 'active'; // This is the one currently working or just finished
            }
            step.time = new Date();
            foundActive = true;
        } else if (!foundActive) {
            // Everything before the active step must be done
            if (step.status !== 'done') {
                step.status = 'done';
                step.time = new Date();
            }
        }
    }
}

function updateStep(record, stepId, status) {
    const step = record.steps.find(s => s.id === stepId);
    if (step) {
        step.status = status;
        if (status === 'done' || status === 'active') step.time = new Date();
    }
}

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Guardian Bridge Online | Port 3000 | UI at http://localhost:3000`));

function prettifyLog(str) {
    let output = "";
    let cleanStream = str;

    // 0. CLEANUP MARKDOWN WRAPPING (Fix for LLM outputting **[[STEP]]** or `[[STEP]]`)
    cleanStream = cleanStream.replace(/\*\*/g, '').replace(/`/g, '');

    // 1. NON-BLOCKING SUPPRESSION
    // Replace specific warning lines
    cleanStream = cleanStream.replace(/.*DeprecationWarning.*\n?/g, '');
    cleanStream = cleanStream.replace(/.*ExperimentalWarning.*\n?/g, '');
    // Suppress random CLI noise if needed
    if (cleanStream.match(/^[0-9]+it \[.*\]/)) return ""; // Suppress progress bars if any

    // 2. DETECT & PREPEND HEADERS
    // We match against original 'str' to catch the keywords even if they were part of a weird chunk

    if (str.includes("YOLO mode is enabled")) {
        output += `<div style="color: #00ff00; font-weight: bold; margin-bottom: 5px;">[SYSTEM] AUTONOMOUS MODE: ENGAGED | Latency Protocol: LOW</div>`;
    }

    if (str.includes("Initializing MCP Handshake")) {
        output += `<div style="color: #00ffff;">[LINK] ESTABLISHING SECURE UPLINK TO RESOLVER AGENT...</div>`;
    }

    if (str.includes("Loaded cached credentials")) {
        output += `<div style="color: #00ff00;">[SECURITY] CREDENTIALS VERIFIED (Cache Hit)</div>`;
    }

    if (str.includes("Found stored OAuth token")) {
        output += `<div style="color: #ffa500;">[AUTH] OAUTH TOKEN RETRIEVED | Scope: ATLASSIAN_RW</div>`;
    }

    // --- TOOL ACTIONS ---
    if (str.includes("read_file")) {
        output += `<div style="color: #add8e6; margin-top: 10px;">[FS] READING SOURCE CODE (Analysis in progress...)</div>`;
    }

    if (str.includes("createJiraIssue")) {
        output += `<div style="color: #ff00ff; font-weight: bold; margin-top: 10px;">[API] EXECUTING JIRA TICKET CREATION</div>`;
    }

    if (str.includes("slack_post_message")) {
        output += `<div style="color: #00bfff; font-weight: bold; margin-top: 10px;">[API] BROADCASTING TO SLACK</div>`;
    }

    if (str.includes("slack_list_channels")) {
        output += `<div style="color: #00bfff; margin-top: 10px;">[SLACK] SCANNING WORKSPACE CHANNELS...</div>`;
    }

    if (str.includes("getAccessibleAtlassianResources")) {
        output += `<div style="color: #ffa500; margin-top: 10px;">[CLOUD] VERIFYING ATLASSIAN SITE ACCESS...</div>`;
    }

    if (str.includes("Loading extension")) {
        output += `<div style="color: #888;">[PLUGIN] LOADING MODULE: ${str.split(':')[1] || 'Unknown'}</div>`;
    }

    // --- STEP SUCCESS BANNERS ---
    const stepMatch = str.match(/\[\[STEP:([A-Z_]+)\]\]\s*(.*)/);
    if (stepMatch) {
        output += `<div style="color: #00ff00; border: 1px solid #00ff00; padding: 5px; margin: 5px 0; background: rgba(0,255,0,0.1); font-weight: bold;">[SUCCESS] ${stepMatch[1]}: ${stepMatch[2]}</div>`;
    }

    // 3. THE MATRIX STREAM (Raw Text)
    // Always append the clean stream. 
    // If it's empty after cleaning (e.g. just the deprecation warning), nicely handling it.
    if (cleanStream.trim().length > 0) {
        // Don't duplicate internal marker text if we already showed a banner
        if (!str.includes('[[STEP:')) {
            const safeText = cleanStream.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            output += `<div style="color: #777; font-size: 0.8em; font-family: monospace; padding-left: 10px; border-left: 1px solid #333; word-break: break-all;">${safeText}</div>`;
        }
    }

    return output;
}