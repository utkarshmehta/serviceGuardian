const listContainer = document.getElementById('alert-list');
const detailsContainer = document.getElementById('details-view');
let selectedAlertId = null;
let lastRenderHash = ""; // To detect changes and prevent flicker

// Poll for alerts every 100ms for real-time "Video Mode" smoothness
setInterval(fetchAlerts, 100);
fetchAlerts();

async function fetchAlerts() {
    try {
        const res = await fetch('/api/alerts');
        const alerts = await res.json();
        renderSidebar(alerts);

        if (selectedAlertId) {
            const current = alerts.find(a => a.id === selectedAlertId);
            if (current) renderDetails(current);
        } else if (alerts.length > 0 && !selectedAlertId) {
            // Auto-select first if none selected
            selectedAlertId = alerts[0].id;
            renderDetails(alerts[0]);
        }
    } catch (err) {
        console.error("Failed to fetch alerts", err);
    }
}

function renderSidebar(alerts) {
    // 1. Initial Render (if empty)
    // We can't just check if empty because alerts might change order or be added.
    // However, for sidebar to "not flicker", we should reuse elements by ID if possible.
    // Simpler approach for 100ms poll: 
    // Just check if the alert IDs in order have changed? 
    // Or just update the text/classes of existing nodes and add new ones?

    // Let's do a simple diff of the HTML string. 
    // If the generated HTML is identical to current, don't touch it.

    const newHtml = alerts.map(alert => `
        <div class="alert-item ${alert.id === selectedAlertId ? 'active' : ''}" onclick="selectAlert(${alert.id})">
            <h3>${alert.text}</h3>
            <div class="time-ago">${new Date(alert.timestamp).toLocaleTimeString()}</div>
        </div>
    `).join('');

    if (listContainer.innerHTML !== newHtml) {
        // Only update if something visually changed (selection, new alert, time update)
        // Time updates every second, so this will still repaint 1/sec, but not 10/sec!
        listContainer.innerHTML = newHtml;
    }
}

function selectAlert(id) {
    selectedAlertId = id;
    lastRenderHash = ""; // Force re-render on switch
    fetchAlerts(); // Trigger re-render
}

function renderDetails(alert) {
    // 1. Initialize Structure if needed
    if (!detailsContainer.querySelector('.hero-status')) {
        detailsContainer.innerHTML = `
            <div class="hero-status">
                <div>
                    <div class="status-label">Current Status</div>
                    <div class="main-status-text"></div>
                    <div class="alert-id-label" style="margin-top: 0.5rem; color: var(--text-secondary)"></div>
                </div>
                <div class="ready-badge-container"></div>
            </div>

            <div class="pipeline-container">
                <ul class="step-list"></ul>
            </div>

            <div class="links-grid">
                <a href="#" target="_blank" class="link-card link-jira">
                    <div class="link-title">JIRA Ticket</div>
                    <div class="link-value">PENDING...</div>
                </a>
                <a href="#" target="_blank" class="link-card link-slack">
                    <div class="link-title">Slack Thread</div>
                    <div class="link-value">View Thread →</div>
                </a>
            </div>

            <div class="logs-box"></div>
        `;
    }

    // 2. Update Status Hero
    const heroEl = detailsContainer.querySelector('.hero-status');
    const statusTextEl = detailsContainer.querySelector('.main-status-text');
    const idLabelEl = detailsContainer.querySelector('.alert-id-label');
    const badgeContainer = detailsContainer.querySelector('.ready-badge-container');

    let statusText = 'INVESTIGATING<span class="flicker"></span>';
    let isError = false;
    let isReady = false;

    if (alert.currentStep === 'ready' || alert.status === 'success') {
        statusText = 'READY FOR RESOLVER AGENT';
        isReady = true;
    } else if (alert.status === 'error') {
        statusText = 'SYSTEM FAILURE';
        isError = true;
    }

    // Use innerHTML for text to support the span
    statusTextEl.innerHTML = statusText;
    idLabelEl.textContent = `Alert ID: #${alert.id}`;

    // Reset Classes
    heroEl.classList.remove('severity-ready', 'severity-error');

    // Apply new classes
    if (isReady) heroEl.classList.add('severity-ready');
    if (isError) heroEl.classList.add('severity-error');

    // Badge
    const badgeHtml = isReady ? `<div class="ready-badge">READY FOR RESOLVER</div>` : '';
    if (badgeContainer.innerHTML !== badgeHtml) badgeContainer.innerHTML = badgeHtml;

    // 3. Update Pipeline Steps (Granular)
    const stepList = detailsContainer.querySelector('.step-list');
    const newStepsHtml = alert.steps ? alert.steps.map(step => `
        <li class="step-item ${step.status}">
            <div class="step-icon">${step.status === 'done' ? '✓' : (step.status === 'active' ? '' : '•')}</div>
            <div class="step-label">${step.label}</div>
        </li>
    `).join('') : '';

    // Only update if html matches? Actually re-rendering steps is cheap and doesn't break layout much.
    // But let's check length to be safe or just replace. 
    // For lists, full replace is usually fine unless items are interactive. Steps are static.
    if (stepList.innerHTML !== newStepsHtml) stepList.innerHTML = newStepsHtml;

    // 4. Update Links (Attributes only)
    const jiraLink = detailsContainer.querySelector('.link-jira');
    const slackLink = detailsContainer.querySelector('.link-slack');
    const jiraValue = jiraLink.querySelector('.link-value');

    // Jira
    if (jiraLink.href !== (alert.jiraLink || '#')) jiraLink.href = alert.jiraLink || '#';
    jiraLink.style.pointerEvents = alert.jiraLink ? 'auto' : 'none';
    jiraLink.style.opacity = alert.jiraLink ? '1' : '0.5';
    if (jiraValue.textContent !== (alert.jiraKey || 'PENDING...')) jiraValue.textContent = alert.jiraKey || 'PENDING...';

    // Slack
    if (slackLink.href !== (alert.slackLink || '#')) slackLink.href = alert.slackLink || '#';
    slackLink.style.pointerEvents = alert.slackLink ? 'auto' : 'none';
    slackLink.style.opacity = alert.slackLink ? '1' : '0.5';

    // 5. Update Logs (Append/Replace content only)
    const logsBox = detailsContainer.querySelector('.logs-box');
    const newLogs = alert.logs || 'Initializing agent...';

    // Check if we need to update logs
    // We compare length or raw string.
    // If different, update innerHTML. 
    // Since we're streaming HTML, we just replace innerHTML.
    // SCROLL POSITION logic needs to happen IF we update.
    if (logsBox.innerHTML !== newLogs) {
        // preserve scroll? No, user wants auto-scroll. 
        // But if user manually scrolled up, we might want to respect that?
        // User asked for "one after another", implying auto-scroll.
        const wasAtBottom = logsBox.scrollHeight - logsBox.scrollTop === logsBox.clientHeight;

        logsBox.innerHTML = newLogs;

        // Auto-scroll ALWAYS or only if was at bottom?
        // Let's force bottom for the "Matrix" feel requested.
        logsBox.scrollTop = logsBox.scrollHeight;
    }
}
