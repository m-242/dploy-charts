// Training UI Application

const API_BASE = '/api';

// State
let scenario = null;
let steps = [];
let currentStep = 1;
let totalSteps = 0;

// Terminal tabs state
let terminals = [];
let activeTerminalId = null;
let terminalCounter = 0;

// DOM Elements
const scenarioTitle = document.getElementById('scenario-title');
const scenarioDescription = document.getElementById('scenario-description');
const currentStepEl = document.getElementById('current-step');
const totalStepsEl = document.getElementById('total-steps');
const instructionsContent = document.getElementById('instructions-content');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnCheck = document.getElementById('btn-check');
const checkResult = document.getElementById('check-result');
const progressOverlay = document.getElementById('progress-overlay');
const terminalTabs = document.getElementById('terminal-tabs');
const terminalsWrapper = document.getElementById('terminals-wrapper');
const btnAddTab = document.getElementById('btn-add-tab');
const resizeHandle = document.getElementById('resize-handle');
const instructionsPanel = document.querySelector('.instructions-panel');

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        // Create first terminal tab
        createTerminalTab();

        // Load scenario and steps in parallel
        const [scenarioData, stepsData] = await Promise.all([
            fetchAPI('/scenario'),
            fetchAPI('/steps')
        ]);

        scenario = scenarioData;
        steps = stepsData;
        totalSteps = steps.length;

        // Update UI
        scenarioTitle.textContent = scenario.name;
        scenarioDescription.textContent = scenario.description;
        totalStepsEl.textContent = totalSteps;

        // Load first step
        await loadStep(1);

        // Setup event listeners
        setupEventListeners();
        setupResizeHandle();
    } catch (error) {
        console.error('Failed to initialize:', error);
        instructionsContent.innerHTML = `
            <div class="error-message">
                <h2>Failed to load scenario</h2>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Terminal Tab Management
function createTerminalTab() {
    terminalCounter++;
    const id = `term-${terminalCounter}`;

    // Create tab element
    const tab = document.createElement('div');
    tab.className = 'terminal-tab';
    tab.dataset.id = id;
    tab.innerHTML = `
        <span class="terminal-tab-status connecting"></span>
        <span class="terminal-tab-title">Terminal ${terminalCounter}</span>
        <span class="terminal-tab-close" title="Close terminal">&times;</span>
    `;

    // Tab click handler
    tab.addEventListener('click', (e) => {
        if (!e.target.classList.contains('terminal-tab-close')) {
            switchToTerminal(id);
        }
    });

    // Close button handler
    tab.querySelector('.terminal-tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeTerminal(id);
    });

    // Insert before the "+" button
    terminalTabs.insertBefore(tab, btnAddTab);

    // Create terminal instance container
    const instance = document.createElement('div');
    instance.className = 'terminal-instance';
    instance.dataset.id = id;
    instance.innerHTML = '<div class="terminal-container"></div>';
    terminalsWrapper.appendChild(instance);

    // Initialize xterm
    const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
        theme: {
            background: '#1a1b26',
            foreground: '#c0caf5',
            cursor: '#c0caf5',
            cursorAccent: '#1a1b26',
            selection: 'rgba(122, 162, 247, 0.3)',
            black: '#414868',
            red: '#f7768e',
            green: '#9ece6a',
            yellow: '#e0af68',
            blue: '#7aa2f7',
            magenta: '#bb9af7',
            cyan: '#7dcfff',
            white: '#c0caf5',
            brightBlack: '#414868',
            brightRed: '#f7768e',
            brightGreen: '#9ece6a',
            brightYellow: '#e0af68',
            brightBlue: '#7aa2f7',
            brightMagenta: '#bb9af7',
            brightCyan: '#7dcfff',
            brightWhite: '#c0caf5'
        }
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon.WebLinksAddon());

    const container = instance.querySelector('.terminal-container');
    term.open(container);

    // Store terminal state
    const terminalState = {
        id,
        term,
        fitAddon,
        ws: null,
        tab,
        instance,
        container
    };

    terminals.push(terminalState);

    // Connect WebSocket
    connectTerminalWebSocket(terminalState);

    // Handle terminal input
    term.onData(data => {
        if (terminalState.ws && terminalState.ws.readyState === WebSocket.OPEN) {
            terminalState.ws.send(data);
        }
    });

    // Switch to new terminal
    switchToTerminal(id);

    return terminalState;
}

function connectTerminalWebSocket(terminalState) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;

    updateTabStatus(terminalState.id, 'connecting');

    const ws = new WebSocket(wsUrl);
    terminalState.ws = ws;

    ws.onopen = () => {
        updateTabStatus(terminalState.id, 'connected');
        if (activeTerminalId === terminalState.id) {
            terminalState.term.focus();
        }
    };

    ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
            event.data.text().then(text => terminalState.term.write(text));
        } else {
            terminalState.term.write(event.data);
        }
    };

    ws.onclose = () => {
        updateTabStatus(terminalState.id, 'disconnected');
        // Check if terminal still exists before reconnecting
        if (terminals.find(t => t.id === terminalState.id)) {
            terminalState.term.write('\r\n\x1b[31mConnection closed. Reconnecting...\x1b[0m\r\n');
            setTimeout(() => {
                if (terminals.find(t => t.id === terminalState.id)) {
                    connectTerminalWebSocket(terminalState);
                }
            }, 2000);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateTabStatus(terminalState.id, 'error');
    };
}

function updateTabStatus(id, status) {
    const terminal = terminals.find(t => t.id === id);
    if (terminal) {
        const statusEl = terminal.tab.querySelector('.terminal-tab-status');
        statusEl.className = `terminal-tab-status ${status}`;
    }
}

function switchToTerminal(id) {
    // Deactivate all tabs and instances
    terminals.forEach(t => {
        t.tab.classList.remove('active');
        t.instance.classList.remove('active');
    });

    // Activate selected terminal
    const terminal = terminals.find(t => t.id === id);
    if (terminal) {
        terminal.tab.classList.add('active');
        terminal.instance.classList.add('active');
        activeTerminalId = id;

        // Fit and focus
        setTimeout(() => {
            terminal.fitAddon.fit();
            terminal.term.focus();
        }, 10);
    }
}

function closeTerminal(id) {
    // Don't close if it's the last terminal
    if (terminals.length <= 1) {
        return;
    }

    const index = terminals.findIndex(t => t.id === id);
    if (index === -1) return;

    const terminal = terminals[index];

    // Close WebSocket
    if (terminal.ws) {
        terminal.ws.close();
    }

    // Dispose terminal
    terminal.term.dispose();

    // Remove DOM elements
    terminal.tab.remove();
    terminal.instance.remove();

    // Remove from array
    terminals.splice(index, 1);

    // Switch to another terminal if this was active
    if (activeTerminalId === id && terminals.length > 0) {
        const newIndex = Math.min(index, terminals.length - 1);
        switchToTerminal(terminals[newIndex].id);
    }
}

function setupEventListeners() {
    btnPrev.addEventListener('click', () => navigateStep(-1));
    btnNext.addEventListener('click', () => navigateStep(1));
    btnCheck.addEventListener('click', checkCurrentStep);
    btnAddTab.addEventListener('click', createTerminalTab);

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        // Check if terminal is focused
        const isTerminalFocused = terminals.some(t =>
            t.container.contains(document.activeElement)
        );

        // Ctrl+Shift+T: New terminal
        if (e.ctrlKey && e.shiftKey && e.key === 'T') {
            e.preventDefault();
            createTerminalTab();
            return;
        }

        // Ctrl+Shift+W: Close terminal
        if (e.ctrlKey && e.shiftKey && e.key === 'W') {
            e.preventDefault();
            if (activeTerminalId) {
                closeTerminal(activeTerminalId);
            }
            return;
        }

        // Ctrl+Tab / Ctrl+Shift+Tab: Switch terminals
        if (e.ctrlKey && e.key === 'Tab') {
            e.preventDefault();
            const currentIndex = terminals.findIndex(t => t.id === activeTerminalId);
            let newIndex;
            if (e.shiftKey) {
                newIndex = currentIndex > 0 ? currentIndex - 1 : terminals.length - 1;
            } else {
                newIndex = currentIndex < terminals.length - 1 ? currentIndex + 1 : 0;
            }
            switchToTerminal(terminals[newIndex].id);
            return;
        }

        // Don't handle navigation keys if terminal is focused
        if (isTerminalFocused) {
            return;
        }

        if (e.key === 'ArrowLeft' && !btnPrev.disabled) {
            navigateStep(-1);
        } else if (e.key === 'ArrowRight' && !btnNext.disabled) {
            navigateStep(1);
        } else if (e.key === 'Enter' && e.ctrlKey && btnCheck.style.display !== 'none') {
            checkCurrentStep();
        }
    });

    // Handle resize
    window.addEventListener('resize', () => {
        terminals.forEach(t => {
            if (t.instance.classList.contains('active')) {
                t.fitAddon.fit();
            }
        });
    });
}

function setupResizeHandle() {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = instructionsPanel.offsetWidth;
        resizeHandle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const delta = e.clientX - startX;
        const newWidth = startWidth + delta;
        const containerWidth = document.querySelector('.container').offsetWidth;
        const percentage = (newWidth / containerWidth) * 100;

        if (percentage >= 20 && percentage <= 50) {
            instructionsPanel.style.width = `${percentage}%`;
            // Fit active terminal
            const activeTerminal = terminals.find(t => t.id === activeTerminalId);
            if (activeTerminal) {
                activeTerminal.fitAddon.fit();
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Fit active terminal
            const activeTerminal = terminals.find(t => t.id === activeTerminalId);
            if (activeTerminal) {
                activeTerminal.fitAddon.fit();
            }
        }
    });
}

async function fetchAPI(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`);
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
}

async function loadStep(stepNumber) {
    try {
        const step = await fetchAPI(`/steps/${stepNumber}`);
        currentStep = stepNumber;

        // Update step indicator
        currentStepEl.textContent = currentStep;

        // Render markdown content
        const html = marked.parse(step.content);
        instructionsContent.innerHTML = html;

        // Highlight code blocks
        instructionsContent.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });

        // Update navigation buttons
        updateNavigationButtons(step.hasCheck);

        // Clear previous check result
        hideCheckResult();

        // Scroll to top
        instructionsContent.scrollTop = 0;
    } catch (error) {
        console.error('Failed to load step:', error);
        instructionsContent.innerHTML = `
            <div class="error-message">
                <h2>Failed to load step</h2>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function updateNavigationButtons(hasCheck) {
    btnPrev.disabled = currentStep <= 1;
    btnNext.disabled = currentStep >= totalSteps;
    btnCheck.style.display = hasCheck ? 'flex' : 'none';
}

function navigateStep(delta) {
    const newStep = currentStep + delta;
    if (newStep >= 1 && newStep <= totalSteps) {
        loadStep(newStep);
    }
}

async function checkCurrentStep() {
    try {
        showProgress();

        const result = await fetch(`${API_BASE}/steps/${currentStep}/check`, {
            method: 'POST'
        }).then(r => r.json());

        hideProgress();
        showCheckResult(result);
    } catch (error) {
        hideProgress();
        showCheckResult({
            success: false,
            message: `Check failed: ${error.message}`
        });
    }
}

function showCheckResult(result) {
    checkResult.textContent = result.message;
    checkResult.className = `check-result ${result.success ? 'success' : 'error'}`;
    checkResult.style.display = 'block';
}

function hideCheckResult() {
    checkResult.style.display = 'none';
}

function showProgress() {
    progressOverlay.style.display = 'flex';
    btnCheck.disabled = true;
}

function hideProgress() {
    progressOverlay.style.display = 'none';
    btnCheck.disabled = false;
}
