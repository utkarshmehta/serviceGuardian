Start-Sleep -s 3
@"
Act as Senior SRE. IGNORE SKILLS.
        1. Read "check-db.ts" (filesystem tool) to find the syntax error.
        2. Use "createJiraIssue" (Project: KAN) to log the bug. 
           NOTE: If "createJiraIssue" is not found, check for "atlassian-rovo-mcp-server-createJiraIssue".
        3. Use "slack_post_message" to post to "triaged-ready-to-fix".
           Message: "✅ *Bug Triaged:* ALERT: critical syntax error in check-db.ts
🎫 *Jira Ticket:* <{JiraURL}|{JiraKey}>
🛠️ *Status:* Ready for Resolver Agent."
"@ | gemini --yolo --include-directories "." --allowed-mcp-server-names slack,atlassian-rovo-mcp-server,filesystem