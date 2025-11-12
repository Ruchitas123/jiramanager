// Application State
let appConfig = {
    savedJiraIds: [],
    scheduledTasks: [],
    globalSettings: { defaultReminderTime: '09:00' }
};

let currentValidationResult = null;
let currentSelectedRapidViewId = null;

// DOM Elements
const elements = {
    connectionStatus: document.getElementById('connection-status'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsMenu: document.getElementById('settings-menu'),
    testConnection: document.getElementById('test-connection'),
    addJiraIdBtn: document.getElementById('add-jira-id-btn'),
    addAnotherJiraBtn: document.getElementById('add-another-jira-btn'),
    savedJiraCards: document.getElementById('saved-jira-cards'),
    savedJiraIds: document.getElementById('saved-jira-ids'),
    emailActionsCard: document.getElementById('email-actions-card'),
    scheduledTasksCard: document.getElementById('scheduled-tasks-card'),
    // These elements don't exist in current HTML structure
    selectedJiraId: null, // document.getElementById('selected-jira-id'),
    selectedBoardInfo: null, // document.getElementById('selected-board-info'),
    selectedBoardName: null, // document.getElementById('selected-board-name'),
    selectedBoardId: null, // document.getElementById('selected-board-id'),
    // These elements don't exist in current HTML - actions are handled per board
    sendStatusNow: null, // document.getElementById('send-status-now'),
    scheduleStatus: null, // document.getElementById('schedule-status'),
    sendReminderNow: null, // document.getElementById('send-reminder-now'),
    scheduleReminder: null, // document.getElementById('schedule-reminder'),
    scheduledTasks: document.getElementById('scheduled-tasks'),
    refreshSchedules: document.getElementById('refresh-schedules'),
    refreshActivity: document.getElementById('refresh-activity'),
    activityLog: document.getElementById('activity-log'),
    addJiraModal: document.getElementById('add-jira-modal'),
    addJiraForm: document.getElementById('add-jira-form'),
    jiraModalClose: document.getElementById('jira-modal-close'),
    cancelJira: document.getElementById('cancel-jira'),
    validateBoardModal: document.getElementById('validate-board-modal'),
    boardValidationResult: document.getElementById('board-validation-result'),
    saveJiraBtn: document.getElementById('save-jira-btn'),
    scheduleModal: document.getElementById('schedule-modal'),
    scheduleForm: document.getElementById('schedule-form'),
    scheduleModalClose: document.getElementById('schedule-modal-close'),
    cancelSchedule: document.getElementById('cancel-schedule'),
    scheduleModalTitle: document.getElementById('schedule-modal-title'),
    confirmModal: document.getElementById('confirm-modal'),
    confirmModalTitle: document.getElementById('confirm-modal-title'),
    confirmModalMessage: document.getElementById('confirm-modal-message'),
    confirmModalDetails: document.getElementById('confirm-modal-details'),
    confirmModalClose: document.getElementById('confirm-modal-close'),
    confirmCancel: document.getElementById('confirm-cancel'),
    confirmProceed: document.getElementById('confirm-proceed'),
    loadingOverlay: document.getElementById('loading-overlay'),
    toastContainer: document.getElementById('toast-container')
};

// Utility Functions
function showLoading() {
    elements.loadingOverlay.classList.add('show');
}

function hideLoading() {
    elements.loadingOverlay.classList.remove('show');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = getToastIcon(type);
    toast.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function getToastIcon(type) {
    const icons = {
        success: 'fas fa-check-circle text-green',
        error: 'fas fa-exclamation-circle text-red',
        warning: 'fas fa-exclamation-triangle text-orange',
        info: 'fas fa-info-circle text-blue'
    };
    return icons[type] || icons.info;
}

function updateConnectionStatus(connected) {
    if (connected) {
        elements.connectionStatus.className = 'connection-status connected';
        elements.connectionStatus.innerHTML = '<i class="fas fa-check-circle"></i><span>Connected</span>';
    } else {
        elements.connectionStatus.className = 'connection-status disconnected';
        elements.connectionStatus.innerHTML = '<i class="fas fa-times-circle"></i><span>Disconnected</span>';
    }
}

function getSelectedRapidViewId() {
    // First try to get from the dropdown if it exists and has a value
    if (elements.selectedJiraId && elements.selectedJiraId.value) {
        return elements.selectedJiraId.value;
    }
    // Fall back to the stored value from board-specific actions
    return currentSelectedRapidViewId;
}

function enableEmailActions() {
    // Email actions are now handled per board, no global buttons to enable
    if (elements.sendStatusNow) elements.sendStatusNow.disabled = false;
    if (elements.scheduleStatus) elements.scheduleStatus.disabled = false;
    if (elements.sendReminderNow) elements.sendReminderNow.disabled = false;
    if (elements.scheduleReminder) elements.scheduleReminder.disabled = false;
}

function disableEmailActions() {
    // Email actions are now handled per board, no global buttons to disable
    if (elements.sendStatusNow) elements.sendStatusNow.disabled = true;
    if (elements.scheduleStatus) elements.scheduleStatus.disabled = true;
    if (elements.sendReminderNow) elements.sendReminderNow.disabled = true;
    if (elements.scheduleReminder) elements.scheduleReminder.disabled = true;
}

function showProgressiveUI() {
    // Show cards based on current state
    if (appConfig.savedJiraIds && appConfig.savedJiraIds.length > 0) {
        elements.savedJiraCards.style.display = 'block';
        elements.scheduledTasksCard.style.display = 'block';
    } else {
        elements.savedJiraCards.style.display = 'none';
        elements.scheduledTasksCard.style.display = 'none';
    }
}

function updateJiraSelectionDropdown() {
    // This function is not needed since the dropdown doesn't exist in current HTML
    // JIRA board selection is now handled directly through the board-specific buttons
    return;
}

// Confirmation Dialog
function showConfirmDialog(title, message, details = null) {
    return new Promise((resolve) => {
        if (elements.confirmModalTitle) elements.confirmModalTitle.textContent = title;
        if (elements.confirmModalMessage) elements.confirmModalMessage.textContent = message;
        
        if (details && elements.confirmModalDetails) {
            elements.confirmModalDetails.innerHTML = details;
            elements.confirmModalDetails.classList.remove('hidden');
        } else if (elements.confirmModalDetails) {
            elements.confirmModalDetails.classList.add('hidden');
        }
        
        if (elements.confirmModal) {
            elements.confirmModal.classList.add('show');
        }
        
        const handleConfirm = () => {
            closeConfirmDialog();
            resolve(true);
        };
        
        const handleCancel = () => {
            closeConfirmDialog();
            resolve(false);
        };
        
        // Remove existing listeners
        if (elements.confirmProceed) {
            elements.confirmProceed.replaceWith(elements.confirmProceed.cloneNode(true));
            elements.confirmProceed = document.getElementById('confirm-proceed');
        }
        if (elements.confirmCancel) {
            elements.confirmCancel.replaceWith(elements.confirmCancel.cloneNode(true));
            elements.confirmCancel = document.getElementById('confirm-cancel');
        }
        if (elements.confirmModalClose) {
            elements.confirmModalClose.replaceWith(elements.confirmModalClose.cloneNode(true));
            elements.confirmModalClose = document.getElementById('confirm-modal-close');
        }
        
        // Add new listeners
        if (elements.confirmProceed) elements.confirmProceed.addEventListener('click', handleConfirm);
        if (elements.confirmCancel) elements.confirmCancel.addEventListener('click', handleCancel);
        if (elements.confirmModalClose) elements.confirmModalClose.addEventListener('click', handleCancel);
    });
}

function closeConfirmDialog() {
    if (elements.confirmModal) {
        elements.confirmModal.classList.remove('show');
    }
}

// API Functions
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`/api${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        
        return data;
    } catch (error) {
        console.error('API Request failed:', error);
        throw error;
    }
}

async function loadConfig() {
    try {
        const data = await apiRequest('/config');
        appConfig = {
            savedJiraIds: data.savedJiraIds || [],
            scheduledTasks: data.scheduledTasks || [],
            globalSettings: data.globalSettings || { defaultReminderTime: '09:00' }
        };
        updateUI();
        return data;
    } catch (error) {
        console.log('No existing config found, using defaults');
        appConfig = {
            savedJiraIds: [],
            scheduledTasks: [],
            globalSettings: { defaultReminderTime: '09:00' }
        };
        updateUI();
    }
}

async function saveConfig() {
    try {
        await apiRequest('/config', {
            method: 'POST',
            body: JSON.stringify(appConfig)
        });
    } catch (error) {
        console.warn('Failed to save configuration:', error);
    }
}

async function testJiraConnection() {
    try {
        showLoading();
        const data = await apiRequest('/test-jira');
        updateConnectionStatus(data.connected);
        showToast(data.connected ? 'JIRA connection successful' : 'JIRA connection failed', 
                  data.connected ? 'success' : 'error');
        return data.connected;
    } catch (error) {
        updateConnectionStatus(false);
        showToast('Failed to test JIRA connection: ' + error.message, 'error');
        return false;
    } finally {
        hideLoading();
    }
}

async function validateBoardInModal() {
    const rapidViewId = document.getElementById('jira-rapid-id').value.trim();
    
    if (!rapidViewId) {
        showToast('Please enter a Rapid View ID', 'warning');
        return;
    }
    
    // Check for duplicate JIRA board ID with string normalization
    const normalizedRapidViewId = String(rapidViewId);
    if (appConfig.savedJiraIds && appConfig.savedJiraIds.some(jira => String(jira.rapidViewId) === normalizedRapidViewId)) {
        currentValidationResult = null;
        elements.boardValidationResult.className = 'validation-result error';
        elements.boardValidationResult.innerHTML = `
            <div class="validation-info">
                <div class="validation-board-name">Duplicate Board ID</div>
                <div class="validation-details">A JIRA board with ID ${rapidViewId} has already been added</div>
            </div>
        `;
        elements.boardValidationResult.classList.remove('hidden');
        elements.saveJiraBtn.disabled = true;
        showToast('This JIRA board ID has already been added', 'error');
        return;
    }
    
    try {
        showLoading();
        const [boardData, issuesData] = await Promise.all([
            apiRequest(`/board/${rapidViewId}`),
            apiRequest(`/board/${rapidViewId}/issues`)
        ]);
        
        currentValidationResult = {
            rapidViewId: rapidViewId,
            name: boardData.data.name,
            type: boardData.data.type,
            issueCount: issuesData.count,
            valid: true
        };
        
        // Show success validation result
        elements.boardValidationResult.className = 'validation-result success';
        elements.boardValidationResult.innerHTML = `
            <div class="validation-info">
                <div class="validation-board-name">${currentValidationResult.name}</div>
                <div class="validation-details">Type: ${currentValidationResult.type} • ${currentValidationResult.issueCount} issues found</div>
            </div>
        `;
        elements.boardValidationResult.classList.remove('hidden');
        elements.saveJiraBtn.disabled = false;
        
        showToast('Board validated successfully', 'success');
        updateActivityLog(`Board validated: ${currentValidationResult.name} (${currentValidationResult.issueCount} issues)`, 'success');
        
    } catch (error) {
        currentValidationResult = null;
        
        // Show error validation result
        elements.boardValidationResult.className = 'validation-result error';
        elements.boardValidationResult.innerHTML = `
            <div class="validation-info">
                <div class="validation-board-name">Validation Failed</div>
                <div class="validation-details">${error.message}</div>
            </div>
        `;
        elements.boardValidationResult.classList.remove('hidden');
        elements.saveJiraBtn.disabled = true;
        
        showToast('Failed to validate board: ' + error.message, 'error');
        updateActivityLog(`Board validation failed: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

async function sendStatusEmailNow() {
    const rapidViewId = getSelectedRapidViewId();
    
    if (!rapidViewId) {
        showToast('Please select a JIRA board first', 'warning');
        return;
    }
    
    try {
        showLoading();
        await apiRequest(`/send-sprint-update/${rapidViewId}`, { method: 'POST' });
        const board = appConfig.savedJiraIds.find(jira => jira.rapidViewId === String(rapidViewId));
        const boardName = board ? board.name : `Board ${rapidViewId}`;
        showToast('Status email sent successfully', 'success');
        updateActivityLog(`Status email sent for ${boardName}`, 'success');
    } catch (error) {
        showToast('Failed to send status email: ' + error.message, 'error');
        updateActivityLog('Status email failed: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function sendReminderEmailNow() {
    if (!appConfig.savedJiraIds || appConfig.savedJiraIds.length === 0) {
        showToast('Please add at least one JIRA board first', 'warning');
        return;
    }
    
    try {
        showLoading();
        await apiRequest('/send-weekly-reminder', { method: 'POST' });
        showToast('Reminder email sent successfully', 'success');
        updateActivityLog('Weekly reminder email sent', 'success');
    } catch (error) {
        showToast('Failed to send reminder email: ' + error.message, 'error');
        updateActivityLog('Reminder email failed: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function addJiraId(name, rapidViewId, validationResult) {
    try {
        // Double-check for duplicates before adding
        if (!appConfig.savedJiraIds) {
            appConfig.savedJiraIds = [];
        }
        
        // Normalize rapidViewId for consistent comparison and storage
        const normalizedRapidViewId = String(rapidViewId);
        
        if (appConfig.savedJiraIds.some(jira => String(jira.rapidViewId) === normalizedRapidViewId)) {
            throw new Error(`JIRA board with ID ${rapidViewId} has already been added`);
        }
        
        console.log('Adding JIRA board with rapidViewId:', normalizedRapidViewId);
        
        // Safety check: Remove any leftover scheduled tasks for this rapidViewId
        // AND remove any orphaned tasks with null rapidViewId
        // This ensures a clean start if the board was previously added and deleted
        if (appConfig.scheduledTasks) {
            const beforeCount = appConfig.scheduledTasks.length;
            appConfig.scheduledTasks = appConfig.scheduledTasks.filter(task => {
                const taskRapidViewId = String(task.rapidViewId || '');
                const isMatchingBoard = taskRapidViewId === normalizedRapidViewId;
                const isOrphanedTask = !task.rapidViewId || taskRapidViewId === '' || taskRapidViewId === 'null';
                
                // Keep tasks that are neither matching this board nor orphaned
                return !isMatchingBoard && !isOrphanedTask;
            });
            const afterCount = appConfig.scheduledTasks.length;
            const cleanedCount = beforeCount - afterCount;
            
            if (cleanedCount > 0) {
                console.log(`Cleaned up ${cleanedCount} leftover/orphaned scheduled tasks`);
                updateActivityLog(`Cleaned up ${cleanedCount} old scheduled task(s) for re-added board`, 'info');
            }
        }
        
        const newJiraId = {
            id: Date.now().toString(),
            name: name,
            rapidViewId: normalizedRapidViewId,
            boardName: validationResult.name,
            boardType: validationResult.type,
            issueCount: validationResult.issueCount,
            validated: true,
            addedAt: new Date().toISOString()
        };
        
        appConfig.savedJiraIds.push(newJiraId);
        await saveConfig();
        updateUI();
        showToast('JIRA board added successfully', 'success');
        updateActivityLog(`Added JIRA board: ${name} (${rapidViewId})`, 'success');
        return newJiraId;
    } catch (error) {
        showToast('Failed to add JIRA board: ' + error.message, 'error');
        throw error;
    }
}

async function removeJiraId(id) {
    if (!appConfig.savedJiraIds) {
        appConfig.savedJiraIds = [];
    }
    
    const jiraToRemove = appConfig.savedJiraIds.find(jira => jira.id === id);
    if (!jiraToRemove) {
        showToast('JIRA board not found', 'error');
        return;
    }
    
    // Find related scheduled tasks
    const relatedTasks = appConfig.scheduledTasks ? 
        appConfig.scheduledTasks.filter(task => task.rapidViewId === jiraToRemove.rapidViewId) : [];
    
    // Prepare confirmation details
    let details = null;
    if (relatedTasks.length > 0) {
        const taskList = relatedTasks.map(task => 
            `<li>${task.type === 'status' ? 'Status Mail' : 'Reminder Mail'} - ${task.frequency} at ${formatTime(task.time)}</li>`
        ).join('');
        details = `
            <strong>This will also delete ${relatedTasks.length} related scheduled task(s):</strong>
            <ul>${taskList}</ul>
            <em style="font-size: 0.8rem; color: #6b778c; margin-top: 8px; display: block;">
                Note: If you add this board again later, you'll need to recreate these schedules.
            </em>
        `;
    }
    
    // Show confirmation dialog
    const confirmed = await showConfirmDialog(
        'Delete JIRA Board',
        `Are you sure you want to delete "${jiraToRemove.name}" (ID: ${jiraToRemove.rapidViewId})?`,
        details
    );
    
    if (!confirmed) {
        return;
    }
    
    try {
        // Remove the JIRA board
        appConfig.savedJiraIds = appConfig.savedJiraIds.filter(jira => jira.id !== id);
        
        // Remove related scheduled tasks with better validation
        if (appConfig.scheduledTasks) {
            const removedTaskCount = appConfig.scheduledTasks.length;
            
            // Convert both values to strings for consistent comparison
            const targetRapidViewId = String(jiraToRemove.rapidViewId);
            
            console.log('Deleting tasks for board:', targetRapidViewId);
            console.log('Current tasks before deletion:', appConfig.scheduledTasks.map(t => ({
                id: t.id, 
                type: t.type, 
                rapidViewId: t.rapidViewId
            })));
            
            // Filter out ALL tasks that match the rapid view ID
            appConfig.scheduledTasks = appConfig.scheduledTasks.filter(task => {
                const taskRapidViewId = String(task.rapidViewId || '');
                const shouldKeep = taskRapidViewId !== targetRapidViewId;
                
                if (!shouldKeep) {
                    console.log(`Removing task: ${task.type} (rapidViewId: ${task.rapidViewId})`);
                }
                
                return shouldKeep;
            });
            
            const remainingTaskCount = appConfig.scheduledTasks.length;
            const deletedTaskCount = removedTaskCount - remainingTaskCount;
            
            console.log('Tasks after deletion:', appConfig.scheduledTasks.map(t => ({
                id: t.id, 
                type: t.type, 
                rapidViewId: t.rapidViewId
            })));
            
            if (deletedTaskCount > 0) {
                updateActivityLog(`Deleted ${deletedTaskCount} scheduled task(s) related to ${jiraToRemove.name}`, 'info');
            } else {
                console.log('Warning: No scheduled tasks were deleted for board:', targetRapidViewId);
            }
        }
        
        await saveConfig();
        updateUI();
        
        updateActivityLog(`Removed JIRA board: ${jiraToRemove.name}`, 'info');
        showToast('JIRA board and related tasks removed successfully', 'success');
        
    } catch (error) {
        showToast('Failed to remove JIRA board: ' + error.message, 'error');
    }
}

// UI Update Functions
function updateUI() {
    showProgressiveUI();
    updateSavedJiraIds();
    updateScheduledTasks();
}

function updateSavedJiraIds() {
    if (!elements.savedJiraIds) return;
    
    elements.savedJiraIds.innerHTML = '';
    
    if (!appConfig.savedJiraIds || appConfig.savedJiraIds.length === 0) {
        elements.savedJiraIds.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bookmark"></i>
                <p>No JIRA boards added yet. Click "Add New JIRA Board" to get started.</p>
            </div>
        `;
        return;
    }
    
    appConfig.savedJiraIds.forEach(jira => {
        const jiraElement = createJiraIdElement(jira);
        elements.savedJiraIds.appendChild(jiraElement);
    });
}

function createJiraIdElement(jira) {
    const div = document.createElement('div');
    div.className = 'jira-id-item expanded';
    div.innerHTML = `
        <div class="jira-id-header">
            <div class="jira-id-info">
                <div class="jira-id-name">${jira.name}</div>
                <div class="jira-id-rapid">Rapid View ID: ${jira.rapidViewId}</div>
                <div class="jira-id-status ${jira.validated ? 'validated' : 'pending'}">
                    ${jira.validated ? 'Validated' : 'Pending Validation'}
                </div>
            </div>
            <div class="jira-id-actions">
                <button class="btn btn-small btn-danger" onclick="confirmRemoveJiraId('${jira.id}', '${jira.name}')">
                    <i class="fas fa-trash"></i>
                    Remove
                </button>
            </div>
        </div>
        
        <div class="board-email-actions">
            <h4><i class="fas fa-envelope"></i> Email Actions for this Board</h4>
            <div class="email-actions-grid">
                <!-- Status Mail Section -->
                <div class="email-action-section">
                    <div class="action-header">
                        <h5><i class="fas fa-chart-line"></i> Status Mail</h5>
                        <p>Send sprint status updates to team members</p>
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-primary btn-small" onclick="sendStatusEmailForBoard('${jira.rapidViewId}')">
                            <i class="fas fa-paper-plane"></i>
                            Send Now
                        </button>
                        <button class="btn btn-outline btn-small" onclick="scheduleStatusForBoard('${jira.rapidViewId}')">
                            <i class="fas fa-calendar-alt"></i>
                            Schedule
                        </button>
                    </div>
                </div>

                <!-- Reminder Mail Section -->
                <div class="email-action-section">
                    <div class="action-header">
                        <h5><i class="fas fa-bell"></i> Reminder Mail</h5>
                        <p>Send reminders to reviewers with pending issues</p>
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-secondary btn-small" onclick="sendReminderEmailForBoard('${jira.rapidViewId}')">
                            <i class="fas fa-bell"></i>
                            Send Now
                        </button>
                        <button class="btn btn-outline btn-small" onclick="scheduleReminderForBoard('${jira.rapidViewId}')">
                            <i class="fas fa-calendar-alt"></i>
                            Schedule
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    return div;
}

function updateScheduledTasks() {
    if (!elements.scheduledTasks) return;
    
    elements.scheduledTasks.innerHTML = '';
    
    if (!appConfig.scheduledTasks || appConfig.scheduledTasks.length === 0) {
        elements.scheduledTasks.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clock"></i>
                <p>No scheduled tasks yet. Use the email actions to schedule automated reminders.</p>
            </div>
        `;
        return;
    }
    
    appConfig.scheduledTasks.forEach(task => {
        const taskElement = createScheduledTaskElement(task);
        elements.scheduledTasks.appendChild(taskElement);
    });
}

function createScheduledTaskElement(task) {
    const div = document.createElement('div');
    div.className = 'scheduled-task-item';
    
    const frequencyText = task.frequency === 'weekly' ? 
        `Weekly on ${getDayName(task.dayOfWeek)} at ${formatTime(task.time)}` :
        `${task.frequency.charAt(0).toUpperCase() + task.frequency.slice(1)} at ${formatTime(task.time)}`;
    
    div.innerHTML = `
        <div class="task-info">
            <div class="task-type">${task.type === 'status' ? 'Status Mail' : 'Reminder Mail'}</div>
            <div class="task-schedule">${frequencyText}</div>
            ${task.rapidViewId ? `<div class="task-board">Board ID: ${task.rapidViewId}</div>` : ''}
        </div>
        <div class="task-controls">
            <label class="toggle-switch task-toggle">
                <input type="checkbox" ${task.enabled ? 'checked' : ''} 
                       onchange="toggleScheduledTask('${task.id}', this.checked)" />
                <span class="slider"></span>
            </label>
            <button class="btn btn-small btn-danger" onclick="deleteScheduledTask('${task.id}')">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    return div;
}

function updateActivityLog(message, type = 'info') {
    if (!elements.activityLog) return;
    
    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    
    const icon = getToastIcon(type);
    const timestamp = new Date().toLocaleString();
    
    activityItem.innerHTML = `
        <i class="${icon}"></i>
        <span>${timestamp} - ${message}</span>
    `;
    
    // Add to top of activity log
    const firstChild = elements.activityLog.firstChild;
    if (firstChild) {
        elements.activityLog.insertBefore(activityItem, firstChild);
    } else {
        elements.activityLog.appendChild(activityItem);
    }
    
    // Keep only last 20 items
    const items = elements.activityLog.children;
    while (items.length > 20) {
        elements.activityLog.removeChild(items[items.length - 1]);
    }
}

// Utility helper functions
function formatTime(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

function getDayName(dayIndex) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayIndex];
}

// Global functions for onclick handlers
window.selectJiraBoard = function(rapidViewId) {
    // Store the selected rapid view ID
    currentSelectedRapidViewId = rapidViewId;
    
    // Update UI if elements exist
    if (elements.selectedBoardName && elements.selectedBoardId && elements.selectedBoardInfo) {
        const board = appConfig.savedJiraIds.find(jira => jira.rapidViewId === String(rapidViewId));
        const boardName = board ? board.name : `Board ${rapidViewId}`;
        
        elements.selectedBoardName.textContent = boardName;
        elements.selectedBoardId.textContent = `ID: ${rapidViewId}`;
        elements.selectedBoardInfo.classList.remove('hidden');
        enableEmailActions();
    }
};

window.confirmRemoveJiraId = function(id, name) {
    removeJiraId(id); // Now uses the modal confirmation dialog
};

window.toggleScheduledTask = async function(taskId, enabled) {
    try {
        if (!appConfig.scheduledTasks) {
            appConfig.scheduledTasks = [];
        }
        
        const task = appConfig.scheduledTasks.find(t => t.id === taskId);
        if (task) {
            task.enabled = enabled;
            await saveConfig();
            
            const taskType = task.type === 'status' ? 'Status Mail' : 'Reminder Mail';
            const action = enabled ? 'enabled' : 'disabled';
            updateActivityLog(`${taskType} schedule ${action}`, 'info');
            showToast(`Schedule ${action} successfully`, 'success');
        }
    } catch (error) {
        showToast('Failed to update schedule: ' + error.message, 'error');
    }
};

window.deleteScheduledTask = async function(taskId) {
    try {
        if (!appConfig.scheduledTasks) {
            appConfig.scheduledTasks = [];
        }
        
        const task = appConfig.scheduledTasks.find(t => t.id === taskId);
        if (!task) {
            showToast('Scheduled task not found', 'error');
            return;
        }
        
        const taskType = task.type === 'status' ? 'Status Mail' : 'Reminder Mail';
        const frequencyText = task.frequency === 'weekly' ? 
            `Weekly on ${getDayName(task.dayOfWeek)} at ${formatTime(task.time)}` :
            `${task.frequency.charAt(0).toUpperCase() + task.frequency.slice(1)} at ${formatTime(task.time)}`;
        
        const confirmed = await showConfirmDialog(
            'Delete Scheduled Task',
            `Are you sure you want to delete this ${taskType} schedule?`,
            `<strong>Schedule:</strong> ${frequencyText}`
        );
        
        if (!confirmed) {
            return;
        }
        
        appConfig.scheduledTasks = appConfig.scheduledTasks.filter(t => t.id !== taskId);
        await saveConfig();
        updateScheduledTasks();
        
        updateActivityLog(`Deleted ${taskType} schedule`, 'info');
        showToast('Scheduled task deleted successfully', 'success');
        
    } catch (error) {
        showToast('Failed to delete scheduled task: ' + error.message, 'error');
    }
};

// Board-specific email action functions
window.sendStatusEmailForBoard = async function(rapidViewId) {
    try {
        showLoading();
        await apiRequest(`/send-sprint-update/${rapidViewId}`, { method: 'POST' });
        const board = appConfig.savedJiraIds.find(jira => jira.rapidViewId === String(rapidViewId));
        const boardName = board ? board.name : `Board ${rapidViewId}`;
        showToast('Status email sent successfully', 'success');
        updateActivityLog(`Status email sent for ${boardName}`, 'success');
    } catch (error) {
        showToast('Failed to send status email: ' + error.message, 'error');
        updateActivityLog('Status email failed: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
};

window.sendReminderEmailForBoard = async function(rapidViewId) {
    try {
        showLoading();
        await apiRequest('/send-weekly-reminder', { method: 'POST' });
        const board = appConfig.savedJiraIds.find(jira => jira.rapidViewId === String(rapidViewId));
        const boardName = board ? board.name : `Board ${rapidViewId}`;
        showToast('Reminder email sent successfully', 'success');
        updateActivityLog(`Reminder email sent for ${boardName}`, 'success');
    } catch (error) {
        showToast('Failed to send reminder email: ' + error.message, 'error');
        updateActivityLog('Reminder email failed: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
};

window.scheduleStatusForBoard = function(rapidViewId) {
    console.log('Scheduling status for board:', rapidViewId);
    // Store the rapid view ID for use in scheduling
    currentSelectedRapidViewId = rapidViewId;
    openScheduleModal('status');
};

window.scheduleReminderForBoard = function(rapidViewId) {
    console.log('Scheduling reminder for board:', rapidViewId);
    // Store the rapid view ID for use in scheduling
    currentSelectedRapidViewId = rapidViewId;
    openScheduleModal('reminder');
};

// Event Handlers
function setupEventListeners() {
    // Settings dropdown
    if (elements.settingsBtn) {
        elements.settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = elements.settingsMenu.classList.contains('show');
            if (isOpen) {
                elements.settingsMenu.classList.remove('show');
                elements.settingsBtn.classList.remove('active');
            } else {
                elements.settingsMenu.classList.add('show');
                elements.settingsBtn.classList.add('active');
            }
        });
    }
    
    // Close settings dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (elements.settingsMenu && !elements.settingsMenu.contains(e.target) && !elements.settingsBtn.contains(e.target)) {
            elements.settingsMenu.classList.remove('show');
            elements.settingsBtn.classList.remove('active');
        }
    });
    
    // Test connection
    if (elements.testConnection) {
        elements.testConnection.addEventListener('click', testJiraConnection);
    }
    
    // JIRA board selection - Skip since dropdown doesn't exist in current HTML
    // Board selection is now handled through individual board action buttons
    
    // Email actions - These buttons don't exist in current HTML
    // Email actions are now handled through board-specific buttons with onclick handlers
    if (elements.sendStatusNow) {
        elements.sendStatusNow.addEventListener('click', sendStatusEmailNow);
    }
    
    if (elements.sendReminderNow) {
        elements.sendReminderNow.addEventListener('click', sendReminderEmailNow);
    }
    
    if (elements.scheduleStatus) {
        elements.scheduleStatus.addEventListener('click', () => {
            openScheduleModal('status');
        });
    }
    
    if (elements.scheduleReminder) {
        elements.scheduleReminder.addEventListener('click', () => {
            openScheduleModal('reminder');
        });
    }
    
    // Add JIRA ID
    if (elements.addJiraIdBtn) {
        elements.addJiraIdBtn.addEventListener('click', () => {
            openAddJiraModal();
        });
    }
    
    if (elements.addAnotherJiraBtn) {
        elements.addAnotherJiraBtn.addEventListener('click', () => {
            openAddJiraModal();
        });
    }
    
    // Modal controls
    if (elements.jiraModalClose) {
        elements.jiraModalClose.addEventListener('click', closeJiraModal);
    }
    
    if (elements.cancelJira) {
        elements.cancelJira.addEventListener('click', closeJiraModal);
    }
    
    if (elements.validateBoardModal) {
        elements.validateBoardModal.addEventListener('click', validateBoardInModal);
    }
    
    // Add JIRA form
    if (elements.addJiraForm) {
        elements.addJiraForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!currentValidationResult || !currentValidationResult.valid) {
                showToast('Please validate the board first', 'warning');
                return;
            }
            
            const name = document.getElementById('jira-name').value;
            
            try {
                showLoading();
                await addJiraId(name, currentValidationResult.rapidViewId, currentValidationResult);
                closeJiraModal();
                elements.addJiraForm.reset();
                currentValidationResult = null;
            } catch (error) {
                // Error already handled in addJiraId
            } finally {
                hideLoading();
            }
        });
    }
    
    // Schedule modal
    if (elements.scheduleModalClose) {
        elements.scheduleModalClose.addEventListener('click', closeScheduleModal);
    }
    
    if (elements.cancelSchedule) {
        elements.cancelSchedule.addEventListener('click', closeScheduleModal);
    }
    
    if (elements.scheduleForm) {
        elements.scheduleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleScheduleSubmit();
        });
    }
    
    // Schedule frequency change
    const scheduleFrequency = document.getElementById('schedule-frequency');
    if (scheduleFrequency) {
        scheduleFrequency.addEventListener('change', (e) => {
            const weeklyGroup = document.getElementById('weekly-day-group');
            if (weeklyGroup) {
                weeklyGroup.style.display = e.target.value === 'weekly' ? 'block' : 'none';
            }
        });
    }
    
    // Modal backdrop clicks
    if (elements.addJiraModal) {
        elements.addJiraModal.addEventListener('click', (e) => {
            if (e.target === elements.addJiraModal) {
                closeJiraModal();
            }
        });
    }
    
    if (elements.scheduleModal) {
        elements.scheduleModal.addEventListener('click', (e) => {
            if (e.target === elements.scheduleModal) {
                closeScheduleModal();
            }
        });
    }
    
    // Activity refresh
    if (elements.refreshActivity) {
        elements.refreshActivity.addEventListener('click', () => {
            updateActivityLog('Activity refreshed', 'info');
        });
    }
    
    if (elements.refreshSchedules) {
        elements.refreshSchedules.addEventListener('click', () => {
            updateScheduledTasks();
            updateActivityLog('Scheduled tasks refreshed', 'info');
        });
    }
}

// Modal functions
function openAddJiraModal() {
    if (elements.addJiraModal) {
        elements.addJiraModal.classList.add('show');
        // Reset form state
        elements.addJiraForm.reset();
        elements.boardValidationResult.classList.add('hidden');
        elements.saveJiraBtn.disabled = true;
        currentValidationResult = null;
    }
}

function closeJiraModal() {
    if (elements.addJiraModal) {
        elements.addJiraModal.classList.remove('show');
    }
}

function closeScheduleModal() {
    if (elements.scheduleModal) {
        elements.scheduleModal.classList.remove('show');
    }
}

function openScheduleModal(type) {
    // Check if any JIRA boards are available
    if (!appConfig.savedJiraIds || appConfig.savedJiraIds.length === 0) {
        showToast('Please add at least one JIRA board first', 'warning');
        return;
    }
    
    // For status emails, require a specific board selection
    if (type === 'status') {
        const rapidViewId = getSelectedRapidViewId();
        if (!rapidViewId) {
            showToast('Please select a JIRA board first', 'warning');
            return;
        }
    }
    
    const scheduleType = document.getElementById('schedule-type');
    if (scheduleType) {
        scheduleType.value = type;
    }
    
    if (elements.scheduleModalTitle) {
        elements.scheduleModalTitle.textContent = type === 'status' ? 'Schedule Status Mail' : 'Schedule Reminder Mail';
    }
    
    if (elements.scheduleModal) {
        elements.scheduleModal.classList.add('show');
    }
}

async function handleScheduleSubmit() {
    const type = document.getElementById('schedule-type').value;
    const frequency = document.getElementById('schedule-frequency').value;
    const time = document.getElementById('schedule-time').value;
    const dayOfWeek = parseInt(document.getElementById('schedule-day').value);
    
    // Get the selected rapid view ID - ALL tasks should be tied to a board
    const selectedRapidViewId = getSelectedRapidViewId();
    
    if (!selectedRapidViewId) {
        showToast('Please select a JIRA board first', 'warning');
        return;
    }
    
    // Convert to string for consistency (all rapidViewIds should be strings)
    const rapidViewId = String(selectedRapidViewId);
    
    console.log('Creating scheduled task:', {
        type: type,
        rapidViewId: rapidViewId,
        frequency: frequency,
        time: time
    });
    
    const newTask = {
        id: Date.now().toString(),
        type: type,
        frequency: frequency,
        time: time,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : null,
        enabled: true, // New tasks are enabled by default
        rapidViewId: rapidViewId,
        createdAt: new Date().toISOString()
    };
    
    if (!appConfig.scheduledTasks) {
        appConfig.scheduledTasks = [];
    }
    
    appConfig.scheduledTasks.push(newTask);
    await saveConfig();
    updateScheduledTasks();
    closeScheduleModal();
    
    const taskDescription = type === 'status' ? 'Status Mail' : 'Reminder Mail';
    const scheduleText = frequency === 'weekly' ? 
        `weekly on ${getDayName(dayOfWeek)}` : frequency;
    
    showToast(`${taskDescription} scheduled ${scheduleText} at ${formatTime(time)}`, 'success');
    updateActivityLog(`Scheduled ${taskDescription.toLowerCase()} ${scheduleText} at ${formatTime(time)}`, 'success');
}

// Initialization
async function init() {
    console.log('🚀 Initializing JIRA Email Reminder Manager...');
    
    try {
        setupEventListeners();
        await loadConfig();
        await testJiraConnection();
        updateActivityLog('Application initialized successfully', 'success');
        console.log('✅ Application initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize application:', error);
        updateActivityLog('Failed to initialize application: ' + error.message, 'error');
    }
}

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
} 