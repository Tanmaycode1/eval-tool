// Chain page logic

let currentData = null;
let unsavedStepRatings = {}; // Temporary storage for unsaved ratings per step
const pendingSaves = {}; // Track pending saves to prevent duplicates
let easyViewEnabled = true; // Easy View toggle state (default ON)

function validateSchemaJSON(schemaStr) {
    if (!schemaStr || schemaStr.trim() === '') {
        return { valid: true, schema: null };
    }
    
    try {
        const parsed = JSON.parse(schemaStr);
        return { valid: true, schema: schemaStr };
    } catch (e) {
        return { valid: false, error: `Invalid JSON: ${e.message}` };
    }
}

function toggleChainSchema(index) {
    const schemaContent = document.getElementById(`schema-content-${index}`);
    const toggleBtn = document.getElementById(`schema-toggle-${index}`);
    
    if (schemaContent && toggleBtn) {
        if (schemaContent.style.display === 'none') {
            schemaContent.style.display = 'block';
            toggleBtn.textContent = 'Collapse';
        } else {
            schemaContent.style.display = 'none';
            toggleBtn.textContent = 'Expand';
        }
    }
}

function getRatingStorageKey() {
    if (!currentData) return null;
    const dropdown = document.getElementById('versions-dropdown');
    const versionId = dropdown ? dropdown.value : '';
    return `chain_rating_step_${currentData.trace_id}_${versionId || 'current'}`;
}

function saveSelectedStepToStorage(stepIndex) {
    const key = getRatingStorageKey();
    if (key && stepIndex !== null && stepIndex !== undefined) {
        localStorage.setItem(key, stepIndex.toString());
    }
}

function getSelectedStepFromStorage() {
    const key = getRatingStorageKey();
    if (!key) return null;
    const stored = localStorage.getItem(key);
    if (stored) {
        const stepIndex = parseInt(stored);
        if (!isNaN(stepIndex)) return stepIndex;
    }
    return null;
}

function openRatingModal() {
    const modal = document.getElementById('rating-modal');
    if (modal) {
        modal.style.display = 'flex';
        unsavedStepRatings = {}; // Clear unsaved ratings when opening modal fresh
        populateChainStepSelector(false);
    }
}

function closeRatingModal() {
    const modal = document.getElementById('rating-modal');
    if (modal) {
        modal.style.display = 'none';
        unsavedStepRatings = {}; // Clear unsaved ratings when closing modal
    }
}

function populateChainStepSelector(resetDropdown = true) {
    if (!currentData || !currentData.events) return;
    
    const selector = document.getElementById('chain-step-selector');
    if (!selector) return;
    
    // Clear existing options except the first one
    selector.innerHTML = '<option value="">Select a response step...</option>';
    
    // Add options for each step
    currentData.events.forEach((event, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `Response ${index + 1}: ${escapeHtml(event.name || 'Step ' + (index + 1))}`;
        selector.appendChild(option);
    });
    
    // If resetDropdown is false, we'll restore the saved step after this
    if (!resetDropdown) {
        const savedStepIndex = getSelectedStepFromStorage();
        if (savedStepIndex !== null && savedStepIndex >= 0 && savedStepIndex < currentData.events.length) {
            selector.value = savedStepIndex;
            selector.dataset.previousIndex = savedStepIndex;
            setTimeout(() => onChainStepSelected(), 100);
        }
    }
}

function onChainStepSelected() {
    const selector = document.getElementById('chain-step-selector');
    const container = document.getElementById('chain-step-rating-container');
    
    if (!selector || !container) return;
    
    // Save current step's unsaved ratings before switching
    const previousIndex = selector.dataset.previousIndex;
    if (previousIndex !== undefined && previousIndex !== '') {
        saveUnsavedStepRating(parseInt(previousIndex));
    }
    
    const selectedIndex = parseInt(selector.value);
    
    if (isNaN(selectedIndex) || !currentData || !currentData.events || selectedIndex < 0 || selectedIndex >= currentData.events.length) {
        container.style.display = 'none';
        saveSelectedStepToStorage(null);
        selector.dataset.previousIndex = '';
        return;
    }
    
    selector.dataset.previousIndex = selectedIndex;
    saveSelectedStepToStorage(selectedIndex);
    
    const selectedEvent = currentData.events[selectedIndex];
    container.style.display = 'block';
        
        const overallRating = document.getElementById('chain-overall-rating');
        const reviewText = document.getElementById('chain-rating-review');
    if (overallRating) overallRating.value = '';
    if (reviewText) reviewText.value = '';
    
    populateChainParameterRatings(selectedEvent);
    
    // Load unsaved ratings first (priority), then saved ratings
    const unsavedRating = unsavedStepRatings[selectedIndex];
    const savedRating = selectedEvent.rating;
    const ratingToLoad = unsavedRating || (savedRating && (typeof savedRating === 'object' ? savedRating : {overall: savedRating}));
    
    if (ratingToLoad) {
        if (overallRating && ratingToLoad.overall) overallRating.value = ratingToLoad.overall;
        if (reviewText && ratingToLoad.review) reviewText.value = ratingToLoad.review;
        
        if (ratingToLoad.parameters) {
            Object.keys(ratingToLoad.parameters).forEach(paramName => {
                const input = document.querySelector(`.chain-param-rating-input[data-param="${escapeHtml(paramName)}"]`);
                if (input) input.value = ratingToLoad.parameters[paramName];
            });
        }
    }
}

function saveUnsavedStepRating(stepIndex) {
    if (stepIndex === null || stepIndex === undefined || isNaN(stepIndex)) return;
    
        const overallRating = document.getElementById('chain-overall-rating');
        const reviewText = document.getElementById('chain-rating-review');
    const paramInputs = document.querySelectorAll('.chain-param-rating-input');
    
    const overall = overallRating && overallRating.value.trim() ? parseInt(overallRating.value) : null;
    const review = reviewText && reviewText.value.trim() ? reviewText.value.trim() : null;
    
    const parameters = {};
    paramInputs.forEach(input => {
        const paramName = input.getAttribute('data-param');
        const value = input.value.trim();
        if (value && paramName) parameters[paramName] = parseInt(value);
    });
    
    if (overall || review || Object.keys(parameters).length > 0) {
        unsavedStepRatings[stepIndex] = {
            overall: overall,
            review: review,
            parameters: Object.keys(parameters).length > 0 ? parameters : null
        };
    } else {
        delete unsavedStepRatings[stepIndex];
    }
}

function populateChainParameterRatings(event) {
    if (!event) return;
    
    const container = document.getElementById('chain-parameter-ratings-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!event.assistant_response || typeof event.assistant_response !== 'object') {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No response data available for this step</p>';
        return;
    }
    
    const response = event.assistant_response;
    const keys = Object.keys(response);
    
    if (keys.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No parameters found in this response</p>';
        return;
    }
    
    keys.forEach(key => {
        const value = response[key];
        // Only show parameters for objects/arrays/strings (skip complex nested structures for now)
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // For nested objects, show the key but note it's nested
            const paramDiv = document.createElement('div');
            paramDiv.style.cssText = 'display: flex; align-items: center; gap: 1rem; padding: 0.5rem; background: var(--bg-primary); border-radius: 4px;';
            paramDiv.innerHTML = `
                <label style="flex: 1; color: var(--text-primary); font-size: 0.9rem;">${escapeHtml(key)} (nested)</label>
                <input type="number" class="chain-param-rating-input" data-param="${escapeHtml(key)}" min="1" max="10" placeholder="1-10" style="width: 100px; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary);">
            `;
            container.appendChild(paramDiv);
        } else if (typeof value === 'string' || typeof value === 'number' || Array.isArray(value)) {
            const paramDiv = document.createElement('div');
            paramDiv.style.cssText = 'display: flex; align-items: center; gap: 1rem; padding: 0.5rem; background: var(--bg-primary); border-radius: 4px;';
            paramDiv.innerHTML = `
                <label style="flex: 1; color: var(--text-primary); font-size: 0.9rem;">${escapeHtml(key)}</label>
                <input type="number" class="chain-param-rating-input" data-param="${escapeHtml(key)}" min="1" max="10" placeholder="1-10" style="width: 100px; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary);">
            `;
            container.appendChild(paramDiv);
        }
    });
    
    if (container.children.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No rateable parameters found</p>';
    }
}

function collectChainRatingData() {
    const selector = document.getElementById('chain-step-selector');
    if (!selector || !selector.value) {
        return null; // No step selected
    }
    
    const selectedIndex = parseInt(selector.value);
    if (isNaN(selectedIndex)) return null;
    
    const overallRating = document.getElementById('chain-overall-rating');
    const reviewText = document.getElementById('chain-rating-review');
    const paramInputs = document.querySelectorAll('.chain-param-rating-input');
    
    const overall = overallRating && overallRating.value.trim() ? parseInt(overallRating.value) : null;
    const review = reviewText && reviewText.value.trim() ? reviewText.value.trim() : null;
    
    const parameters = {};
    paramInputs.forEach(input => {
        const paramName = input.getAttribute('data-param');
        const value = input.value.trim();
        if (value && paramName) {
            parameters[paramName] = parseInt(value);
        }
    });
    
    // Only return rating object if at least one field is filled
    if (overall || Object.keys(parameters).length > 0 || review) {
        const rating = {};
        if (overall) rating.overall = overall;
        if (Object.keys(parameters).length > 0) rating.parameters = parameters;
        if (review) rating.review = review;
        
        // Return both the rating and the step index
        return {
            stepIndex: selectedIndex,
            rating: rating
        };
    }
    
    return null; // No rating provided
}

/**
 * Render task metrics as cards
 */
function renderTaskMetricsAsCards(obj, stepIndex, existingRating) {
    // Find all task-related metric fields (arrays or single values)
    // Include fields starting with 'task_' and 'user_'
    const taskMetricFields = {};
    let taskCount = 0;
    const hasArrays = [];
    
    // Look for arrays first to determine task count
    // Include both task_ and user_ fields
    for (const [key, value] of Object.entries(obj)) {
        if ((key.startsWith('task_') || key.startsWith('user_')) && !key.includes('tasks') && value !== null && value !== undefined) {
            taskMetricFields[key] = value;
            if (Array.isArray(value)) {
                hasArrays.push(key);
                if (value.length > taskCount) {
                    taskCount = value.length;
                }
            }
        }
    }
    
    // If no arrays found, check for single values - render one card
    if (taskCount === 0 && Object.keys(taskMetricFields).length > 0) {
        taskCount = 1;
    }
    
    // If no task metrics found, return null
    if (Object.keys(taskMetricFields).length === 0 || taskCount === 0) {
        return null;
    }
    
    const rating = existingRating && typeof existingRating === 'object' ? existingRating : (existingRating ? {overall: existingRating} : {});
    const paramRatings = rating.parameters || {};
    
    let html = '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; width: 100%;">';
    
    // Render one card per task
    for (let i = 0; i < taskCount; i++) {
        html += '<div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; box-shadow: var(--shadow);">';
        
        // Header with Task label
        html += `<div style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color);">Task ${i + 1}</div>`;
        
        // Render each metric field with rating
        for (const [fieldName, fieldValue] of Object.entries(taskMetricFields)) {
            let value;
            if (Array.isArray(fieldValue)) {
                if (i < fieldValue.length) {
                    value = fieldValue[i];
                } else {
                    continue; // Skip if index out of bounds
                }
            } else {
                // Single value - show for all tasks
                value = fieldValue;
            }
            
            if (value === null || value === undefined || value === '') {
                continue;
            }
            
            // Format field name (remove task_/user_ prefix, replace _ with spaces, capitalize)
            const displayName = fieldName.replace(/^(task_|user_)/, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const paramKey = `${fieldName}_${i}`;
            const fieldRating = paramRatings[paramKey] || '';
            const fieldRatingId = `chain-rating-${stepIndex}-${paramKey}`;
            
            html += '<div style="margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color);">';
            
            // Field header with name and rating input
            html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">';
            html += `<div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">${escapeHtml(displayName)}</div>`;
            html += `<input type="number" id="${fieldRatingId}" data-step-index="${stepIndex}" data-param="${paramKey}" class="chain-inline-rating-input" min="1" max="10" placeholder="1-10" value="${fieldRating}" style="width: 80px; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); text-align: center;">`;
            html += '</div>';
            
            // Field value
            if (typeof value === 'boolean') {
                html += `<div style="font-size: 0.9rem; color: var(--text-primary);">${value ? 'Yes' : 'No'}</div>`;
            } else if (typeof value === 'number') {
                html += `<div style="font-size: 0.9rem; color: var(--text-primary); font-weight: 600;">${escapeHtml(String(value))}</div>`;
            } else if (typeof value === 'string') {
                html += `<div style="font-size: 0.9rem; color: var(--text-primary); line-height: 1.4; white-space: pre-wrap;">${escapeHtml(value)}</div>`;
            } else {
                html += `<div style="font-size: 0.9rem; color: var(--text-primary); font-family: monospace;">${escapeHtml(JSON.stringify(value, null, 2))}</div>`;
            }
            
            html += '</div>';
        }
        
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

/**
 * Render tasks as card grid
 */
function renderTasksAsCards(tasks, stepIndex, paramName) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return '<div class="table-value">No tasks found</div>';
    }
    
    let html = '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; width: 100%;">';
    
    tasks.forEach((task, idx) => {
        // Determine border color based on relevance score
        const relevanceScore = task.task_relevance_score !== undefined && task.task_relevance_score !== null ? parseInt(task.task_relevance_score) : 0;
        const borderColor = relevanceScore >= 4 ? '#10b981' : '#ef4444'; // Green if >= 4, red otherwise
        const bgColor = relevanceScore >= 4 ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)'; // Light green or light red background
        
        html += `<div style="background: ${bgColor}; border: 2px solid ${borderColor}; border-radius: 8px; padding: 1rem; box-shadow: var(--shadow);">`;
        
        // Task Title
        html += `<div style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color);">${escapeHtml(task.task_title || 'Untitled Task')}</div>`;
        
        // Simple details
        if (task.task_assignee) {
            html += `<div style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>Assignee:</strong> ${escapeHtml(task.task_assignee)}</div>`;
        }
        if (task.task_assigner) {
            html += `<div style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>Assigner:</strong> ${escapeHtml(task.task_assigner)}</div>`;
        }
        if (task.task_schedule_date_boolean && task.task_schedule_date) {
            html += `<div style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>Due:</strong> ${escapeHtml(task.task_schedule_date)}</div>`;
        }
        if (task.task_reminder_boolean && task.task_reminder_time) {
            html += `<div style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>Reminder:</strong> ${escapeHtml(task.task_reminder_time)}</div>`;
        }
        if (task.task_relevance_score !== undefined && task.task_relevance_score !== null) {
            html += `<div style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>Relevance:</strong> ${escapeHtml(task.task_relevance_score)}/5</div>`;
        }
        
        // Source Text
        if (task.task_source_text) {
            html += `<div style="margin-top: 1rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px; border-left: 3px solid var(--accent-highlight);">`;
            html += `<div style="font-size: 0.85rem; color: var(--text-primary); white-space: pre-wrap;">${escapeHtml(task.task_source_text)}</div>`;
            html += '</div>';
        }
        
        // Logic sections - collapsed
        const logicItems = [];
        if (task.task_assignee_logic) logicItems.push({label: 'Assignee Logic', value: task.task_assignee_logic});
        if (task.task_category_logic) logicItems.push({label: 'Category Logic', value: task.task_category_logic});
        if (task.task_relevance_logic) logicItems.push({label: 'Relevance Logic', value: task.task_relevance_logic});
        if (task.task_schedule_date_logic) logicItems.push({label: 'Schedule Logic', value: task.task_schedule_date_logic});
        if (task.task_reminder_logic) logicItems.push({label: 'Reminder Logic', value: task.task_reminder_logic});
        
        if (logicItems.length > 0) {
            html += '<details style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">';
            html += `<summary style="cursor: pointer; color: var(--text-secondary); font-weight: 500; font-size: 0.85rem;">View Logic</summary>`;
            html += '<div style="margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem;">';
            logicItems.forEach(item => {
                html += `<div style="padding: 0.5rem; background: var(--bg-secondary); border-radius: 4px;">`;
                html += `<div style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.25rem;">${escapeHtml(item.label)}</div>`;
                html += `<div style="font-size: 0.85rem; color: var(--text-primary); line-height: 1.4;">${escapeHtml(item.value)}</div>`;
                html += '</div>';
            });
            html += '</div>';
            html += '</details>';
        }
        
        html += '</div>';
    });
    
    html += '</div>';
    return html;
}

/**
 * Render conversation transcript as chat interface
 */
function renderConvTranscriptAsChat(transcript, stepIndex, paramName) {
    if (!Array.isArray(transcript) || transcript.length === 0) {
        return '<div class="table-value">Empty transcript</div>';
    }
    
    let html = '<div style="background: var(--bg-secondary); border-radius: 8px; padding: 0.75rem; width: 100%; box-sizing: border-box;">';
    
    transcript.forEach((msg, idx) => {
        const sender = msg.msg_sender || msg.sender || 'Unknown';
        const content = msg.msg_content || msg.content || msg.text || '';
        const timestamp = msg.msg_time_stamp || msg.timestamp || msg.time_stamp || '';
        
        // Alternate message alignment for visual distinction
        const isEven = idx % 2 === 0;
        
        html += `<div style="display: flex; flex-direction: column; margin-bottom: 0.75rem; align-items: ${isEven ? 'flex-start' : 'flex-end'}; ${idx === transcript.length - 1 ? '' : 'border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;'}">`;
        
        // Message bubble - more compact, less wide
        html += `<div style="max-width: 60%; padding: 0.5rem 0.75rem; border-radius: 6px; background: ${isEven ? 'var(--bg-tertiary)' : 'var(--accent-highlight)'}; color: ${isEven ? 'var(--text-primary)' : 'white'}; word-wrap: break-word;">`;
        html += `<div style="font-weight: 600; margin-bottom: 0.25rem; font-size: 0.85rem; opacity: ${isEven ? '0.9' : '1'};">${escapeHtml(sender)}</div>`;
        html += `<div style="line-height: 1.4; white-space: pre-wrap; font-size: 0.9rem;">${escapeHtml(content)}</div>`;
        if (timestamp) {
            html += `<div style="font-size: 0.7rem; opacity: ${isEven ? '0.7' : '0.85'}; margin-top: 0.25rem;">${escapeHtml(timestamp)}</div>`;
        }
        html += '</div>';
        
        html += '</div>';
    });
    
    html += '</div>';
    return html;
}

/**
 * Render JSON response as table with inline rating column
 */
function renderChainResponseWithRatings(obj, stepIndex, existingRating) {
    if (!obj || typeof obj !== 'object') {
        return '<div class="table-value">' + escapeHtml(String(obj)) + '</div>';
    }

    // Get existing parameter ratings
    const rating = existingRating && typeof existingRating === 'object' ? existingRating : (existingRating ? {overall: existingRating} : {});
    const paramRatings = rating.parameters || {};

    // Separate special parameters if Easy View is enabled
    const convTranscript = easyViewEnabled && obj.conv_transcript && Array.isArray(obj.conv_transcript) ? obj.conv_transcript : null;
    const tasks = easyViewEnabled && obj.tasks && Array.isArray(obj.tasks) ? obj.tasks : null;
    
    // Check for task metrics (fields starting with task_ or user_)
    const taskMetrics = easyViewEnabled ? renderTaskMetricsAsCards(obj, stepIndex, existingRating) : null;
    const taskMetricFields = new Set();
    if (taskMetrics) {
        // Identify which fields are task metrics
        for (const [key] of Object.entries(obj)) {
            if (key.startsWith('task_') || key.startsWith('user_')) {
                taskMetricFields.add(key);
            }
        }
    }
    
    const otherParams = { ...obj };
    if (convTranscript) {
        delete otherParams.conv_transcript;
    }
    if (tasks) {
        delete otherParams.tasks;
    }
    // Remove task metrics fields from otherParams
    taskMetricFields.forEach(field => {
        delete otherParams[field];
    });

    let html = '';
    
    // Render conv_transcript as full-width chat interface if Easy View is enabled
    if (convTranscript) {
        const convRating = paramRatings['conv_transcript'] || '';
        const convRatingId = `chain-rating-${stepIndex}-conv_transcript`;
        html += '<div style="margin-bottom: 1.5rem; width: 100%;">';
        html += '<div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">';
        html += `<label style="font-weight: 600; color: var(--text-primary); font-size: 0.95rem;">conv_transcript</label>`;
        html += `<input type="number" id="${convRatingId}" data-step-index="${stepIndex}" data-param="conv_transcript" class="chain-inline-rating-input" min="1" max="10" placeholder="1-10" value="${convRating}" style="width: 80px; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); text-align: center;">`;
        html += '</div>';
        html += renderConvTranscriptAsChat(convTranscript, stepIndex, 'conv_transcript');
        html += '</div>';
    }
    
    // Render tasks as card grid if Easy View is enabled
    if (tasks) {
        const tasksRating = paramRatings['tasks'] || '';
        const tasksRatingId = `chain-rating-${stepIndex}-tasks`;
        html += '<div style="margin-bottom: 1.5rem; width: 100%;">';
        html += '<div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">';
        html += `<label style="font-weight: 600; color: var(--text-primary); font-size: 0.95rem;">tasks</label>`;
        html += `<input type="number" id="${tasksRatingId}" data-step-index="${stepIndex}" data-param="tasks" class="chain-inline-rating-input" min="1" max="10" placeholder="1-10" value="${tasksRating}" style="width: 80px; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); text-align: center;">`;
        html += '</div>';
        html += renderTasksAsCards(tasks, stepIndex, 'tasks');
        html += '</div>';
    }
    
    // Render task metrics as cards if Easy View is enabled
    if (taskMetrics) {
        html += '<div style="margin-bottom: 1.5rem; width: 100%;">';
        html += '<div style="font-weight: 600; color: var(--text-primary); font-size: 0.95rem; margin-bottom: 0.75rem;">Task Metrics</div>';
        html += taskMetrics;
        html += '</div>';
        // Attach rating listeners to task metric rating inputs
        setTimeout(() => {
            for (let i = 0; i < Object.keys(taskMetricFields).length; i++) {
                attachRatingAutoSaveListeners(stepIndex);
            }
        }, 10);
    }

    // Render other parameters in table (only if there are other parameters)
    if (Object.keys(otherParams).length > 0) {
        html += '<table class="response-table" style="width: 100%;">';
        html += '<thead><tr><th style="width: 130px; text-align: center; padding: 0.5rem;">Rating</th><th style="padding: 0.5rem;">Parameter</th><th style="padding: 0.5rem;">Value</th></tr></thead>';
        html += '<tbody>';
        
        for (const [key, value] of Object.entries(otherParams)) {
            const currentRating = paramRatings[key] || '';
            const ratingId = `chain-rating-${stepIndex}-${key}`;
            
            html += '<tr>';
            // Rating column
            html += `<td style="text-align: center; vertical-align: top; padding: 0.5rem;">`;
            html += `<input type="number" id="${ratingId}" data-step-index="${stepIndex}" data-param="${escapeHtml(key)}" class="chain-inline-rating-input" min="1" max="10" placeholder="1-10" value="${currentRating}" style="width: 80px; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); text-align: center;">`;
            html += `</td>`;
            
            // Parameter name column
            html += `<td class="table-key" style="padding: 0.5rem; font-weight: 600;">${escapeHtml(key)}</td>`;
            
            // Value column
            html += '<td class="table-value" style="padding: 0.5rem;">';
            
            if (Array.isArray(value)) {
                html += `<span class="array-badge">Array (${value.length} items)</span>`;
                if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                    html += renderArrayAsTable(value);
                } else {
                    html += '<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">';
                    value.forEach(item => {
                        html += `<li style="margin: 0.25rem 0;">${escapeHtml(String(item))}</li>`;
                    });
                    html += '</ul>';
                }
            } else if (value !== null && typeof value === 'object') {
                // For nested objects, show a collapsed version or full table
                html += renderJSONAsTable(value);
            } else {
                const valueClass = getValueClass(value);
                html += `<span class="${valueClass}">${escapeHtml(String(value))}</span>`;
            }
            
            html += '</td>';
            html += '</tr>';
        }
        
        html += '</tbody>';
        html += '</table>';
    }
    
    return html;
}

/**
 * Attach auto-save event listeners to rating inputs
 */
function attachRatingAutoSaveListeners(stepIndex) {
    const ratingInputs = document.querySelectorAll(`input.chain-inline-rating-input[data-step-index="${stepIndex}"]`);
    
    ratingInputs.forEach((input) => {
        // Save immediately on change (when value is confirmed)
        input.addEventListener('change', (e) => {
            e.stopPropagation();
            autoSaveChainParameterRating(stepIndex);
        });
        
        // Save immediately on blur (when user moves away)
        input.addEventListener('blur', (e) => {
            e.stopPropagation();
            autoSaveChainParameterRating(stepIndex);
        });
    });
}

/**
 * Auto-save parameter rating for a step
 */
async function autoSaveChainParameterRating(stepIndex) {
    if (!currentData || !currentData.is_chain || !currentData.events || !currentData.events[stepIndex]) {
        return;
    }
    
    // Prevent duplicate saves
    const saveKey = `step-${stepIndex}`;
    if (pendingSaves[saveKey]) {
        return; // Save already in progress
    }
    
    pendingSaves[saveKey] = true;
    
    try {
        // Collect all parameter ratings for this step
        const ratingInputs = document.querySelectorAll(`input.chain-inline-rating-input[data-step-index="${stepIndex}"]`);
        const parameters = {};
        
        ratingInputs.forEach(input => {
            const paramName = input.getAttribute('data-param');
            const value = input.value.trim();
            if (value && paramName) {
                const ratingValue = parseInt(value);
                if (!isNaN(ratingValue) && ratingValue >= 1 && ratingValue <= 10) {
                    parameters[paramName] = ratingValue;
                }
            }
        });
        
        // Get existing rating or create new one
        const existingRating = currentData.events[stepIndex].rating || {};
        const rating = typeof existingRating === 'object' ? existingRating : {overall: existingRating};
        
        // Update parameters
        if (Object.keys(parameters).length > 0) {
            rating.parameters = parameters;
        } else {
            // If no parameters rated, remove parameters but keep other rating fields
            if (rating.parameters) {
                delete rating.parameters;
            }
        }
        
        // Update currentData immediately
        currentData.events[stepIndex].rating = rating;
        
        // Always try to save - if version exists, save to database; otherwise store for later
        const dropdown = document.getElementById('versions-dropdown');
        const versionId = dropdown ? dropdown.value : '';
        
        if (versionId && versionId !== '') {
            // Save to database immediately via updateChainStepRating API
            await API.updateChainStepRating({
                version_id: versionId,
                step_index: stepIndex,
                rating: Object.keys(rating).length > 0 ? rating : null
            });
            // Update rating badge
            refreshRatingBadge(stepIndex);
        } else {
            // Store in unsaved ratings for later (when version is saved)
            unsavedStepRatings[stepIndex] = rating;
            refreshRatingBadge(stepIndex);
        }
    } finally {
        // Clear the pending save flag after a short delay to allow for rapid changes
        setTimeout(() => {
            delete pendingSaves[saveKey];
        }, 100);
    }
}

/**
 * Replace template variables in prompt text with values from previous steps
 * Supports:
 * - {{{2[title]}}} - Get specific key from step 2's response
 * - {{{2}}} - Get entire response from step 2
 * Only replaces if step number < currentStep and data exists
 */
function replaceTemplateVariables(promptText, currentStepIndex) {
    if (!currentData || !currentData.events || !promptText) {
        return promptText;
    }
    
    // Pattern to match {{{number}} or {{{number[key]}}}
    const templatePattern = /\{\{\{(\d+)(?:\[([^\]]+)\])?\}\}\}/g;
    
    return promptText.replace(templatePattern, (match, stepNumStr, keyPath) => {
        const stepNum = parseInt(stepNumStr);
        const stepIndex = stepNum - 1; // Convert to 0-based index
        
        // Only replace if step number is less than current step (previous step)
        if (stepIndex >= currentStepIndex) {
            return match; // Don't replace - step hasn't completed yet
        }
        
        // Check if step exists and has response
        if (!currentData.events || !currentData.events[stepIndex]) {
            return match; // Don't replace - step doesn't exist
        }
        
        const previousEvent = currentData.events[stepIndex];
        const previousResponse = previousEvent.assistant_response;
        
        if (!previousResponse) {
            return match; // Don't replace - no response available
        }
        
        // If keyPath is provided, extract nested value
        if (keyPath) {
            try {
                // Handle nested keys like "user.name" or array access
                const keys = keyPath.split('.');
                let value = previousResponse;
                
                for (const key of keys) {
                    // Handle array index access like "items[0]"
                    if (key.includes('[') && key.includes(']')) {
                        const arrayKey = key.substring(0, key.indexOf('['));
                        const indexMatch = key.match(/\[(\d+)\]/);
                        if (arrayKey) {
                            value = value[arrayKey];
                        }
                        if (indexMatch && Array.isArray(value)) {
                            value = value[parseInt(indexMatch[1])];
                        }
                    } else {
                        value = value[key];
                    }
                    
                    if (value === undefined || value === null) {
                        return match; // Don't replace - key not found
                    }
                }
                
                // Convert value to string
                if (typeof value === 'object') {
                    return JSON.stringify(value);
                }
                return String(value);
            } catch (e) {
                console.warn(`Error extracting key "${keyPath}" from step ${stepNum}:`, e);
                return match; // Don't replace on error
            }
        } else {
            // Return entire response as JSON string
            try {
                if (typeof previousResponse === 'object') {
                    return JSON.stringify(previousResponse, null, 2);
                }
                return String(previousResponse);
            } catch (e) {
                console.warn(`Error stringifying response from step ${stepNum}:`, e);
                return match; // Don't replace on error
            }
        }
    });
}

function aggregateChainMetadata() {
    if (!currentData || !currentData.events || !currentData.is_chain) {
        return;
    }
    
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let totalLatency = 0;
    const providers = new Set();
    const models = new Set();
    
    // Aggregate from all events
    for (let i = 0; i < currentData.events.length; i++) {
        const event = currentData.events[i];
        if (event && event.metrics) {
            const metrics = event.metrics;
            
            // Sum tokens
            if (metrics.input_tokens) {
                totalInputTokens += parseInt(metrics.input_tokens) || 0;
            } else if (metrics.tokens && metrics.tokens.input) {
                totalInputTokens += parseInt(metrics.tokens.input) || 0;
            }
            
            if (metrics.output_tokens) {
                totalOutputTokens += parseInt(metrics.output_tokens) || 0;
            } else if (metrics.tokens && metrics.tokens.output) {
                totalOutputTokens += parseInt(metrics.tokens.output) || 0;
            }
            
            // Sum cost
            if (metrics.total_cost_usd) {
                totalCost += parseFloat(metrics.total_cost_usd) || 0;
            } else if (metrics.cost) {
                totalCost += parseFloat(metrics.cost) || 0;
            }
            
            // Sum latency
            if (metrics.latency !== undefined && metrics.latency !== null) {
                let latencyValue = metrics.latency;
                if (typeof latencyValue === 'string') {
                    latencyValue = parseFloat(latencyValue.replace('s', '')) || 0;
                }
                totalLatency += parseFloat(latencyValue) || 0;
            }
            
            // Collect providers and models
            if (event.model) {
                models.add(event.model);
                // Determine provider from model
                if (event.model.includes('gpt')) {
                    providers.add('openai');
                } else if (event.model.includes('claude')) {
                    providers.add('anthropic');
                } else if (event.model.includes('gemini')) {
                    providers.add('gemini');
                }
            }
            if (metrics.provider) {
                providers.add(metrics.provider);
            }
        }
    }
    
    // Update currentData metadata
    if (!currentData.metadata) {
        currentData.metadata = {};
    }
    
    currentData.metadata.total_tokens = {
        input: totalInputTokens,
        output: totalOutputTokens
    };
    currentData.metadata.input_tokens = totalInputTokens;
    currentData.metadata.output_tokens = totalOutputTokens;
    currentData.metadata.total_cost_usd = totalCost;
    currentData.metadata.total_cost = totalCost;
    currentData.metadata.latency = `${totalLatency.toFixed(2)}s`;
    currentData.metadata.total_latency = totalLatency;
    currentData.metadata.providers = Array.from(providers);
    currentData.metadata.models = Array.from(models);
    currentData.metadata.event_count = currentData.events.length;
    
    // Preserve existing fields
    if (!currentData.metadata.trace_id && currentData.trace_id) {
        currentData.metadata.trace_id = currentData.trace_id;
    }
    if (!currentData.metadata.chain_name && currentData.chain_name) {
        currentData.metadata.chain_name = currentData.chain_name;
    }
    if (!currentData.metadata.timestamp) {
        currentData.metadata.timestamp = new Date().toISOString();
    }
    
    // Metadata will be shown in modal when user clicks info button
}

function displayMetadata(metadata) {
    const metadataGrid = document.getElementById('metadata-grid');
    if (!metadataGrid) return;
    
    metadataGrid.innerHTML = '';

    let latencyDisplay = 'N/A';
    if (metadata.latency !== undefined && metadata.latency !== null) {
        if (typeof metadata.latency === 'string') {
            latencyDisplay = metadata.latency.endsWith('s') ? metadata.latency : `${metadata.latency}s`;
        } else {
            latencyDisplay = `${metadata.latency}s`;
        }
    }

    let costDisplay = 'N/A';
    if (metadata.total_cost_usd !== undefined && metadata.total_cost_usd !== null) {
        if (typeof metadata.total_cost_usd === 'number') {
            costDisplay = `$${metadata.total_cost_usd.toFixed(6)}`;
        } else {
            costDisplay = metadata.total_cost_usd;
        }
    }

    let timestampDisplay = 'N/A';
    if (metadata.timestamp) {
        timestampDisplay = metadata.timestamp;
    }

    // Format providers and models
    let providersDisplay = 'N/A';
    if (metadata.providers && Array.isArray(metadata.providers) && metadata.providers.length > 0) {
        providersDisplay = metadata.providers.join(', ');
    } else if (metadata.provider) {
        providersDisplay = metadata.provider;
    }
    
    let modelsDisplay = 'N/A';
    if (metadata.models && Array.isArray(metadata.models) && metadata.models.length > 0) {
        modelsDisplay = metadata.models.join(', ');
    } else if (metadata.model) {
        modelsDisplay = metadata.model;
    }

    const metadataItems = [
        { label: 'Trace ID', value: metadata.trace_id || 'N/A' },
        { label: 'Models', value: modelsDisplay },
        { label: 'Providers', value: providersDisplay },
        { label: 'Latency', value: latencyDisplay },
        { label: 'Input Tokens', value: metadata.total_tokens?.input || metadata.input_tokens || 0 },
        { label: 'Output Tokens', value: metadata.total_tokens?.output || metadata.output_tokens || 0 },
        { label: 'Total Cost', value: costDisplay },
        { label: 'Event Count', value: metadata.event_count || (metadata.events ? metadata.events.length : 'N/A') },
        { label: 'Chain Name', value: metadata.chain_name || 'N/A' },
        { label: 'Timestamp', value: timestampDisplay }
    ];

    metadataItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'metadata-item';
        div.innerHTML = `
            <span class="metadata-label">${item.label}</span>
            <span class="metadata-value">${item.value}</span>
        `;
        metadataGrid.appendChild(div);
    });
}

async function loadChain(traceId) {
    showLoading(true);
    hideError();
    
    // Show full-page processing state - hide chain container and show loading
    const chainContainer = document.getElementById('chain-container');
    if (chainContainer) {
        chainContainer.innerHTML = '';
        chainContainer.style.display = 'block';
    }
    
    // Create full-page processing overlay
    const processingOverlay = document.createElement('div');
    processingOverlay.id = 'chain-loading-overlay';
    processingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--bg-primary);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 2rem;
    `;
    processingOverlay.innerHTML = `
        <div class="spinner" style="margin-bottom: 2rem; width: 48px; height: 48px;"></div>
        <h2 style="color: var(--text-primary); font-size: 1.5rem; font-weight: 600; margin: 0 0 0.5rem 0;">Loading Prompt Chain</h2>
        <p style="color: var(--text-secondary); font-size: 1rem; margin: 0 0 0.25rem 0;">Fetching chain data from PostHog...</p>
        <p style="color: var(--text-tertiary); font-size: 0.9rem; margin: 0;">Processing events and preparing chain view</p>
    `;
    document.body.appendChild(processingOverlay);

    try {
        const data = await API.processInput(traceId);
        
        if (!data.is_chain) {
            showError('Not a valid chain trace ID');
            if (processingOverlay.parentNode) {
                processingOverlay.parentNode.removeChild(processingOverlay);
            }
            // Restore original displays
            return;
        }
        
        // Small delay to ensure processing state is visible
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Remove overlay before displaying
        if (processingOverlay.parentNode) {
            processingOverlay.parentNode.removeChild(processingOverlay);
        }
        
        // Restore original displays
        displayChain(data);
    } catch (error) {
        // Try to load from database
        try {
            const versions = await API.getChainVersions(traceId);
            if (versions.length > 0) {
                const latestVersion = versions[0];
                currentData = {
                    is_chain: true,
                    trace_id: latestVersion.trace_id,
                    chain_name: latestVersion.chain_name,
                    events: latestVersion.chain_events,
                    metadata: latestVersion.metadata || {}
                };
                
                // Update overlay message
                const messageP = processingOverlay.querySelector('p');
                if (messageP) {
                    messageP.textContent = 'Loading saved version from database...';
                }
                
                // Small delay to ensure processing state is visible
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Remove overlay before displaying
                if (processingOverlay.parentNode) {
                    processingOverlay.parentNode.removeChild(processingOverlay);
                }
                
                // Restore original displays
                displayChain(currentData);
                loadChainVersions(traceId, true); // Preserve selection
                return;
            }
        } catch (dbError) {
            console.error('DB load error:', dbError);
        }
        
        // Remove overlay on error
        if (processingOverlay.parentNode) {
            processingOverlay.parentNode.removeChild(processingOverlay);
        }
        
        // Restore original displays
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

async function displayChain(chainData) {
    console.log('Displaying chain with', chainData.events.length, 'prompts');
    
    if (Object.keys(availableModels).length === 0) {
        await loadModels();
    }
    
    currentData = {
        ...chainData,
        is_chain: true,
        trace_id: chainData.trace_id,
        metadata: chainData.metadata
    };
    
    // Metadata will be shown in modal when user clicks info button
    
    const chainContainer = document.getElementById('chain-container');
    if (!chainContainer) return;
    
    chainContainer.innerHTML = '';
    
    // Buttons are now in the top bar (defined in HTML template)
    
    // Create vertical container for all prompts
    const promptsContainer = document.createElement('div');
    promptsContainer.id = 'chain-prompts-container';
    promptsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2rem;';
    
    // Create all prompt panels (all visible)
    chainData.events.forEach((event, index) => {
        const promptPanels = createChainPromptPanels(event, index, chainData.events.length);
        promptsContainer.appendChild(promptPanels);
    });
    
    chainContainer.appendChild(promptsContainer);
    
    loadChainVersions(chainData.trace_id, true); // Preserve selection when reloading
}

// Tab switching functions removed - all prompts are now displayed vertically

function createChainPromptPanels(event, index, totalPrompts) {
    const promptWrapper = document.createElement('div');
    promptWrapper.className = 'chain-prompt-wrapper';
    promptWrapper.id = `chain-prompt-${index}`;
    promptWrapper.style.marginBottom = '0';
    
    const promptLabel = document.createElement('div');
    promptLabel.id = `chain-title-${index}`;
    promptLabel.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px;';
    
    // Title text
    const titleText = document.createElement('span');
    titleText.style.cssText = 'font-size: 1.1rem; font-weight: 600; color: var(--text-primary);';
    
    // Check if this step has a rating
    let ratingBadge = '';
    if (event.rating) {
        const rating = typeof event.rating === 'object' ? event.rating : {overall: event.rating};
        const overall = rating.overall || (typeof event.rating === 'number' ? event.rating : null);
        if (overall) {
            ratingBadge = ` <span style="font-size: 0.85rem; color: var(--accent-primary); font-weight: 500;">★ ${overall}/10</span>`;
        } else {
            ratingBadge = ` <span style="font-size: 0.85rem; color: var(--accent-primary); font-weight: 500;">★ Rated</span>`;
        }
    }
    
    titleText.innerHTML = `<span style="color: var(--accent-primary);">Step ${index + 1}/${totalPrompts}</span> - ${escapeHtml(event.name || 'Unknown')}${ratingBadge}`;
    
    promptLabel.appendChild(titleText);
    promptWrapper.appendChild(promptLabel);
    
    const userPrompt = event.user_prompt || '';
    const userImages = event.user_images || [];
    const assistantResponse = event.assistant_response || {};
    
    let provider = 'openai';
    if (event.model && event.model.includes('claude')) {
        provider = 'anthropic';
    } else if (event.model && event.model.includes('gemini')) {
        provider = 'gemini';
    }
    
    const userPanel = document.createElement('div');
    userPanel.className = 'view-panel';
    userPanel.id = `chain-user-panel-${index}`;
    userPanel.style.display = 'none'; // Hidden by default
    userPanel.innerHTML = `
        <div class="panel-header">
            <div class="panel-title">
                <svg class="panel-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                <span>User Prompt</span>
            </div>
            <div class="panel-controls">
                <select class="chain-provider-select control-select" data-prompt-index="${index}">
                    <option value="openai" ${provider === 'openai' ? 'selected' : ''}>OpenAI</option>
                    <option value="anthropic" ${provider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
                    <option value="gemini" ${provider === 'gemini' ? 'selected' : ''}>Gemini</option>
                </select>
                <select class="chain-model-select control-select" data-prompt-index="${index}">
                    <option value="">Select model...</option>
                </select>
                <button class="control-btn primary chain-regenerate-btn" data-prompt-index="${index}">Regenerate</button>
            </div>
        </div>
        <div class="panel-content">
            <div class="chain-images-display" id="chain-images-${index}"></div>
            <textarea class="chain-prompt-input edit-prompt-area" data-prompt-index="${index}" placeholder="User prompt...">${escapeHtml(userPrompt)}</textarea>
            
            <!-- Response Schema Section -->
            <div class="schema-section" id="schema-section-${index}" style="margin-top: 1rem; display: none;">
                <div class="schema-header" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px; cursor: pointer;" onclick="toggleChainSchema(${index})">
                    <span style="font-weight: 500; color: var(--text-primary);">📋 Response Schema</span>
                    <button class="collapse-btn" id="schema-toggle-${index}" style="background: none; border: none; color: var(--text-secondary); cursor: pointer;">Expand</button>
                </div>
                <div id="schema-content-${index}" class="schema-content" style="display: none; margin-top: 0.5rem;">
                    <textarea class="schema-editor chain-schema-editor" data-prompt-index="${index}" placeholder="Zod schema JSON (optional)..." style="width: 100%; min-height: 400px; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace; font-size: 0.85rem; line-height: 1.6; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); resize: vertical; white-space: pre;"></textarea>
                    <div style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">
                        <span>💡 Edit schema to customize output format</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const assistantPanel = document.createElement('div');
    assistantPanel.className = 'view-panel';
    assistantPanel.innerHTML = `
        <div class="panel-header">
            <div class="panel-title" style="cursor: pointer;" onclick="toggleChainResponse(${index})">
                <svg class="panel-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                </svg>
                <span>Assistant Response</span>
                <svg id="chain-collapse-icon-${index}" style="width: 1rem; height: 1rem; margin-left: 0.5rem; transition: transform 0.2s;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </div>
            <div class="panel-controls">
                <button class="control-btn" onclick="event.stopPropagation(); openChainInputOverlay(${index})" style="display: flex; align-items: center; gap: 0.5rem;">
                    <svg style="width: 1rem; height: 1rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                    </svg>
                    <span>View/Edit Input</span>
                </button>
            </div>
        </div>
        <div class="panel-content" id="chain-response-content-${index}">
            <div class="chain-response-display" id="chain-response-${index}"></div>
        </div>
    `;
    
    promptWrapper.appendChild(userPanel); // Hidden, but kept for overlay
    promptWrapper.appendChild(assistantPanel); // Full width response
    
    const imagesContainer = promptWrapper.querySelector(`#chain-images-${index}`);
    if (userImages.length > 0) {
        userImages.forEach(imgUrl => {
            const img = document.createElement('img');
            img.src = imgUrl;
            img.className = 'prompt-image';
            img.style.maxWidth = '200px';
            img.style.marginRight = '0.5rem';
            img.style.marginBottom = '0.5rem';
            img.style.borderRadius = '4px';
            img.style.cursor = 'pointer';
            img.style.transition = 'transform 0.2s, box-shadow 0.2s';
            img.title = 'Click to view larger';
            
            // Add hover effect
            img.onmouseenter = function() {
                this.style.transform = 'scale(1.05)';
                this.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
            };
            img.onmouseleave = function() {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = 'none';
            };
            
            // Open modal on click
            img.onclick = function() {
                openImageModal(imgUrl);
            };
            
            imagesContainer.appendChild(img);
        });
    }
    
    const responseDiv = promptWrapper.querySelector(`#chain-response-${index}`);
    if (assistantResponse && typeof assistantResponse === 'object' && !Array.isArray(assistantResponse)) {
        responseDiv.innerHTML = renderChainResponseWithRatings(assistantResponse, index, event.rating);
        // Attach auto-save event listeners to rating inputs (use setTimeout to ensure DOM is ready)
        setTimeout(() => {
            attachRatingAutoSaveListeners(index);
        }, 10);
    } else {
        responseDiv.innerHTML = syntaxHighlight(JSON.stringify(assistantResponse, null, 2));
    }
    
    // Extract and display schema if available
    const schemaSection = promptWrapper.querySelector(`#schema-section-${index}`);
    const schemaEditor = promptWrapper.querySelector(`.chain-schema-editor[data-prompt-index="${index}"]`);
    
    if (event.properties && event.properties.prompt_schema) {
        if (schemaSection) schemaSection.style.display = 'block';
        if (schemaEditor) {
            // Pretty print the schema for readability
            let schemaStr = event.properties.prompt_schema;
            if (typeof schemaStr !== 'string') {
                schemaStr = JSON.stringify(schemaStr, null, 2);
            } else {
                // Try to parse and re-stringify for pretty printing
                try {
                    const parsed = JSON.parse(schemaStr);
                    schemaStr = JSON.stringify(parsed, null, 2);
                } catch (e) {
                    // If parsing fails, use as-is
                }
            }
            schemaEditor.value = schemaStr;
        }
    }
    
    const providerSelect = promptWrapper.querySelector(`.chain-provider-select[data-prompt-index="${index}"]`);
    const modelSelect = promptWrapper.querySelector(`.chain-model-select[data-prompt-index="${index}"]`);
    
    providerSelect.addEventListener('change', () => {
        populateChainModelSelect(modelSelect, event.model, index, providerSelect.value);
    });
    
    populateChainModelSelect(modelSelect, event.model, index, provider);
    
    const regenerateBtn = promptWrapper.querySelector(`.chain-regenerate-btn[data-prompt-index="${index}"]`);
    regenerateBtn.addEventListener('click', async () => {
        try {
            await regenerateSingleChainPrompt(index);
        } catch (error) {
            showError(error.message);
        }
    });
    
    return promptWrapper;
}

async function regenerateSingleChainPrompt(promptIndex) {
    if (!currentData || !currentData.is_chain) {
        throw new Error('No chain data loaded');
    }
    
    const promptWrapper = document.querySelector(`#chain-prompt-${promptIndex}`);
    if (!promptWrapper) {
        throw new Error(`Prompt ${promptIndex + 1} not found`);
    }
    
    const textarea = promptWrapper.querySelector(`.chain-prompt-input[data-prompt-index="${promptIndex}"]`);
    const providerSelect = promptWrapper.querySelector(`.chain-provider-select[data-prompt-index="${promptIndex}"]`);
    const modelSelect = promptWrapper.querySelector(`.chain-model-select[data-prompt-index="${promptIndex}"]`);
    const responseDiv = promptWrapper.querySelector(`#chain-response-${promptIndex}`);
    
    const promptText = textarea ? textarea.value.trim() : '';
    const providerValue = providerSelect ? providerSelect.value : '';
    const modelValue = modelSelect ? modelSelect.value : '';
    
    if (!providerValue || !modelValue) {
        throw new Error(`Please select a provider and model for Prompt ${promptIndex + 1}`);
    }
    
    if (!promptText) {
        throw new Error(`Prompt ${promptIndex + 1} cannot be empty`);
    }
    
    // Extract model from format "provider:model" (model select includes provider prefix)
    const parts = modelValue.split(':');
    const provider = providerValue; // Use provider from provider select
    const model = parts.slice(1).join(':'); // Extract model name without provider prefix
    
    const imagesContainer = promptWrapper.querySelector(`#chain-images-${promptIndex}`);
    const images = [];
    if (imagesContainer) {
        const imgElements = imagesContainer.querySelectorAll('img');
        imgElements.forEach(img => images.push(img.src));
    }
    
    // Get schema if provided and validate it
    const schemaEditor = promptWrapper.querySelector(`.chain-schema-editor[data-prompt-index="${promptIndex}"]`);
    let responseSchema = null;
    if (schemaEditor && schemaEditor.value.trim()) {
        const validation = validateSchemaJSON(schemaEditor.value.trim());
        if (!validation.valid) {
            responseDiv.innerHTML = `<p style="color: #dc2626;">Schema validation failed: ${escapeHtml(validation.error)}</p>`;
            showError(`Schema validation failed: ${validation.error}`);
            return;
        }
        responseSchema = validation.schema;
    }
    
    responseDiv.innerHTML = '<div class="spinner"></div>';
    hideError();
    
    try {
        const result = await API.regenerate({
            prompt: promptText,
            provider: provider,
            model: model,
            image_urls: images,
            response_schema: responseSchema
        });
        
        // Backend returns assistant_response, not response
        const assistantResponse = result.assistant_response || result.response;
        const existingRating = currentData.events && currentData.events[promptIndex] ? currentData.events[promptIndex].rating : null;
        if (assistantResponse && typeof assistantResponse === 'object' && !Array.isArray(assistantResponse)) {
            responseDiv.innerHTML = renderChainResponseWithRatings(assistantResponse, promptIndex, existingRating);
            setTimeout(() => {
                attachRatingAutoSaveListeners(promptIndex);
            }, 10);
        } else if (assistantResponse) {
            responseDiv.innerHTML = syntaxHighlight(JSON.stringify(assistantResponse, null, 2));
        } else {
            responseDiv.innerHTML = '<p style="color: var(--text-secondary);">No response received</p>';
        }
        
        if (currentData.events && currentData.events[promptIndex]) {
            currentData.events[promptIndex].user_prompt = promptText;
            currentData.events[promptIndex].assistant_response = assistantResponse;
            currentData.events[promptIndex].model = model;
            currentData.events[promptIndex].metrics = result.metadata || {};
        }
        
        // Update aggregated metadata
        aggregateChainMetadata();
        
    } catch (error) {
        responseDiv.innerHTML = `<p style="color: #dc2626;">Error: ${escapeHtml(error.message)}</p>`;
        throw error;
    }
}

async function regenerateChain() {
    if (!currentData || !currentData.is_chain) {
        showError('No chain data loaded');
        return;
    }
    
    const promptWrappers = document.querySelectorAll('.chain-prompt-wrapper');
    const totalPrompts = promptWrappers.length;
    
    if (totalPrompts === 0) {
        showError('No prompts to regenerate');
        return;
    }
    
    // Collect all prompts and validate first
    const promptsData = [];
    for (let index = 0; index < promptWrappers.length; index++) {
        const wrapper = promptWrappers[index];
        const textarea = wrapper.querySelector(`.chain-prompt-input[data-prompt-index="${index}"]`);
        const providerSelect = wrapper.querySelector(`.chain-provider-select[data-prompt-index="${index}"]`);
        const modelSelect = wrapper.querySelector(`.chain-model-select[data-prompt-index="${index}"]`);
        
        const promptText = textarea ? textarea.value.trim() : '';
        const providerValue = providerSelect ? providerSelect.value : '';
        const modelValue = modelSelect ? modelSelect.value : '';
        
        if (!providerValue || !modelValue) {
            showError(`Please select a provider and model for Prompt ${index + 1}`);
            return;
        }
        
        if (!promptText) {
            showError(`Prompt ${index + 1} cannot be empty`);
            return;
        }
        
        // Extract model from format "provider:model" (model select includes provider prefix)
        const parts = modelValue.split(':');
        const actualModel = parts.slice(1).join(':'); // Handle models with colons in name
        
        // Collect images
        const imagesContainer = wrapper.querySelector(`#chain-images-${index}`);
        const images = [];
        if (imagesContainer) {
            const imgElements = imagesContainer.querySelectorAll('img');
            imgElements.forEach(img => images.push(img.src));
        }
        
        // Get schema if provided and validate it
        const schemaEditor = wrapper.querySelector(`.chain-schema-editor[data-prompt-index="${index}"]`);
        let responseSchema = null;
        if (schemaEditor && schemaEditor.value.trim()) {
            const validation = validateSchemaJSON(schemaEditor.value.trim());
            if (!validation.valid) {
                showError(`Prompt ${index + 1} schema validation failed: ${validation.error}`);
                return;
            }
            responseSchema = validation.schema;
        }
        
        promptsData.push({
            wrapper: wrapper,
            prompt: promptText,
            provider: providerValue,
            model: actualModel, // Use extracted model name without provider prefix
            images: images,
            response_schema: responseSchema,
            index: index
        });
    }
    
    let regenerateBtn = document.getElementById('regenerate-chain-btn');
    if (regenerateBtn) {
        regenerateBtn.disabled = true;
        regenerateBtn.textContent = 'Regenerating...';
    }
    
    hideError();
    
    const regeneratedEvents = [];
    let successCount = 0;
    let errorCount = 0;
    
    // Regenerate each prompt sequentially
    for (let i = 0; i < promptsData.length; i++) {
        const promptData = promptsData[i];
        const responseDiv = promptData.wrapper.querySelector(`#chain-response-${promptData.index}`);
        
        // Show loading for this specific prompt
        if (responseDiv) {
            responseDiv.innerHTML = '<div class="spinner"></div><p style="margin-top: 0.5rem; color: var(--text-secondary);">Generating response...</p>';
        }
        
        try {
            // Replace template variables with values from previous steps
            // Use the most recent responses from currentData.events
            let processedPrompt = replaceTemplateVariables(promptData.prompt, promptData.index);
            
            // Regenerate single prompt with processed prompt text
            const result = await API.regenerate({
                prompt: processedPrompt,
                provider: promptData.provider,
                model: promptData.model,
                image_urls: promptData.images,
                response_schema: promptData.response_schema
            });
            
            // Display result - backend returns assistant_response, not response
            if (responseDiv) {
                const assistantResponse = result.assistant_response || result.response;
                const existingRating = currentData.events && currentData.events[i] ? currentData.events[i].rating : null;
                if (assistantResponse && typeof assistantResponse === 'object' && !Array.isArray(assistantResponse)) {
                    responseDiv.innerHTML = renderChainResponseWithRatings(assistantResponse, promptData.index, existingRating);
                    setTimeout(() => {
                        attachRatingAutoSaveListeners(promptData.index);
                    }, 10);
                } else if (assistantResponse) {
                    responseDiv.innerHTML = syntaxHighlight(JSON.stringify(assistantResponse, null, 2));
                } else {
                    responseDiv.innerHTML = '<p style="color: var(--text-secondary);">No response received</p>';
                }
            }
            
            // Store regenerated event data
            const assistantResponse = result.assistant_response || result.response;
            regeneratedEvents.push({
                type: "generation",
                name: `prompt_${i + 1}`,
                model: promptData.model,
                user_prompt: promptData.prompt, // Store original prompt with template variables
                user_images: promptData.images,
                assistant_response: assistantResponse,
                metrics: result.metadata || {}
            });
            
            // Update currentData event - store original prompt and processed response
            if (currentData.events && currentData.events[i]) {
                currentData.events[i].user_prompt = promptData.prompt; // Original with template variables
                currentData.events[i].assistant_response = assistantResponse;
                currentData.events[i].model = promptData.model;
                currentData.events[i].metrics = result.metadata || {};
            } else if (currentData.events) {
                // Create new event if it doesn't exist
                currentData.events[i] = {
                    type: "generation",
                    name: `prompt_${i + 1}`,
                    model: promptData.model,
                    user_prompt: promptData.prompt,
                    user_images: promptData.images,
                    assistant_response: assistantResponse,
                    metrics: result.metadata || {}
                };
            }
            
            // Update next step's prompt textarea with processed template variables
            // This gives visual feedback that chaining is working
            if (i + 1 < promptsData.length) {
                const nextPromptData = promptsData[i + 1];
                const nextTextarea = nextPromptData.wrapper.querySelector(`.chain-prompt-input[data-prompt-index="${nextPromptData.index}"]`);
                
                if (nextTextarea) {
                    // Get the original prompt text
                    const originalNextPrompt = nextPromptData.prompt;
                    // Process it with template variables from completed steps
                    const processedNextPrompt = replaceTemplateVariables(originalNextPrompt, nextPromptData.index);
                    
                    // Update the textarea to show the processed version
                    nextTextarea.value = processedNextPrompt;
                    
                    // Visual indicator that prompt was updated
                    nextTextarea.style.backgroundColor = '#f0f9ff'; // Light blue highlight
                    setTimeout(() => {
                        nextTextarea.style.backgroundColor = ''; // Reset after 1 second
                    }, 1000);
                }
            }
            
            successCount++;
            
        } catch (error) {
            console.error(`Error regenerating prompt ${i + 1}:`, error);
            errorCount++;
            
            if (responseDiv) {
                responseDiv.innerHTML = `<p style="color: #dc2626;">Error: ${escapeHtml(error.message)}</p>`;
            }
            
            // Don't throw - continue with next prompt
        }
    }
    
    // Aggregate and update metadata from all regenerated events
    if (successCount > 0) {
        aggregateChainMetadata();
    }
    
    // Final status message
    regenerateBtn = document.getElementById('regenerate-chain-btn');
    if (regenerateBtn) {
        regenerateBtn.disabled = false;
        regenerateBtn.textContent = 'Regenerate Chain';
    }
    
    if (errorCount === 0) {
        showSuccess(`Chain regenerated successfully! All ${successCount} prompts completed.`);
    } else if (successCount > 0) {
        showError(`Completed with errors: ${successCount} succeeded, ${errorCount} failed.`);
    } else {
        showError(`All prompts failed to regenerate.`);
    }
}

function refreshRatingBadge(stepIndex) {
    if (!currentData || !currentData.events || stepIndex < 0 || stepIndex >= currentData.events.length) return;
    
    const event = currentData.events[stepIndex];
    const promptWrapper = document.getElementById(`chain-prompt-${stepIndex}`);
    if (promptWrapper) {
        const promptLabel = promptWrapper.querySelector('div:first-child');
        if (promptLabel) {
            let ratingBadge = '';
            if (event.rating) {
                const rating = typeof event.rating === 'object' ? event.rating : {overall: event.rating};
                const overall = rating.overall || null;
                if (overall) {
                    ratingBadge = ` <span style="font-size: 0.85rem; color: var(--accent-primary); font-weight: 500;">★ ${overall}/10</span>`;
                } else {
                    ratingBadge = ` <span style="font-size: 0.85rem; color: var(--accent-primary); font-weight: 500;">★ Rated</span>`;
                }
            }
            promptLabel.innerHTML = `<span style="color: var(--accent-primary);">Step ${stepIndex + 1}/${currentData.events.length}</span> - ${escapeHtml(event.name || 'Unknown')}${ratingBadge}`;
        }
    }
}

async function updateChainRating() {
    if (!currentData || !currentData.is_chain) {
        showError('No chain data available');
        return;
    }
    
    const dropdown = document.getElementById('versions-dropdown');
    const versionId = dropdown ? dropdown.value : '';
    
    if (!versionId || versionId === '') {
        showError('Cannot update rating for "Current Version". Please save a version first or use "Save Version" to create a new one.');
        return;
    }
    
    // Save current step's unsaved rating
    const selector = document.getElementById('chain-step-selector');
    if (selector && selector.value !== '') {
        saveUnsavedStepRating(parseInt(selector.value));
    }
    
    // Update all steps that have unsaved ratings
    if (Object.keys(unsavedStepRatings).length === 0) {
        showError('No ratings to update. Please rate at least one step.');
        return;
    }
    
    try {
        for (const stepIndex of Object.keys(unsavedStepRatings)) {
            const idx = parseInt(stepIndex);
        await API.updateChainStepRating({
            version_id: versionId,
                step_index: idx,
                rating: unsavedStepRatings[idx] || null
        });
        
            if (currentData.events[idx]) {
                currentData.events[idx].rating = unsavedStepRatings[idx];
                refreshRatingBadge(idx);
            }
        }
        
        showSuccess(`Updated ratings for ${Object.keys(unsavedStepRatings).length} step(s)!`);
        unsavedStepRatings = {};
        loadChainVersions(currentData.trace_id, true);
        onChainStepSelected();
        
    } catch (error) {
        showError(error.message);
    }
}

async function addChainToCompare() {
    if (!currentData || !currentData.is_chain) {
        showError('No chain data to save');
        return;
    }
    
    // Save current step's unsaved rating before saving
    const selector = document.getElementById('chain-step-selector');
    if (selector && selector.value !== '') {
        saveUnsavedStepRating(parseInt(selector.value));
    }
    
    // Create a copy of events to avoid mutating currentData
    const eventsToSave = currentData.events.map(event => ({...event}));
    
    // Apply all unsaved ratings to the events
    Object.keys(unsavedStepRatings).forEach(stepIndex => {
        const idx = parseInt(stepIndex);
        if (eventsToSave[idx] && unsavedStepRatings[idx]) {
            eventsToSave[idx].rating = unsavedStepRatings[idx];
    }
    });
    
    try {
        const version_id = `${currentData.trace_id}_${Date.now()}`;
        
        await API.saveChainVersion({
            version_id: version_id,
            trace_id: currentData.trace_id,
            chain_name: currentData.chain_name,
            chain_events: eventsToSave,
            total_tokens_input: currentData.metadata.total_tokens.input,
            total_tokens_output: currentData.metadata.total_tokens.output,
            total_cost: currentData.metadata.total_cost,
            rating: null, // Chain-level rating is now null, ratings are per-step
            metadata: currentData.metadata
        });
        
        showSuccess('Successfully added chain to compare!');
        console.log('Chain version saved for comparison');
        
        // Update currentData with all saved ratings
        Object.keys(unsavedStepRatings).forEach(stepIndex => {
            const idx = parseInt(stepIndex);
            if (currentData.events[idx]) {
                currentData.events[idx].rating = unsavedStepRatings[idx];
                refreshRatingBadge(idx);
        }
        });
        
        loadChainVersions(currentData.trace_id, true);
        closeRatingModal();
    } catch (error) {
        showError(error.message);
    }
}

async function openCompareView() {
    if (!currentData || !currentData.is_chain) {
        showError('No chain data available');
        return;
    }
    
    const modal = document.getElementById('compare-modal');
    const content = document.getElementById('compare-modal-content');
    
    if (!modal || !content) return;
    
    // Show modal with loading state
    modal.style.display = 'flex';
    content.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">Loading versions...</div>';
    
    try {
        // Fetch all versions
        const versions = await API.getChainVersions(currentData.trace_id);
        
        if (!versions || versions.length === 0) {
            content.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">No saved versions to compare. Save some versions first!</div>';
            return;
        }
        
        // Build comparison view
        content.innerHTML = buildComparisonView(versions);
    } catch (error) {
        content.innerHTML = `<div style="text-align: center; padding: 3rem; color: #dc2626;">Error loading versions: ${escapeHtml(error.message)}</div>`;
        showError('Failed to load versions for comparison');
    }
}

function closeCompareView() {
    const modal = document.getElementById('compare-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function buildComparisonView(versions) {
    if (!versions || versions.length === 0) {
        return '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">No versions to compare</div>';
    }
    
    // Sort versions by creation date (oldest first)
    const sortedVersions = [...versions].sort((a, b) => {
        return new Date(a.created_at) - new Date(b.created_at);
    });
    
    // Determine max number of steps across all versions
    const maxSteps = Math.max(...sortedVersions.map(v => v.chain_events ? v.chain_events.length : 0));
    
    let html = '<div style="overflow-x: auto;">';
    html += '<table style="width: 100%; border-collapse: separate; border-spacing: 0.5rem;">';
    
    // Header row with version info
    html += '<thead><tr style="position: sticky; top: 0; background: var(--bg-primary); z-index: 5;">';
    html += '<th style="min-width: 120px; padding: 1rem; background: var(--bg-tertiary); border-radius: 8px; text-align: left; font-weight: 600; color: var(--text-primary); position: sticky; left: 0; z-index: 6;">Step</th>';
    
    sortedVersions.forEach((version, idx) => {
        const date = new Date(version.created_at).toLocaleString();
        const versionNum = idx + 1;
        html += `
            <th style="min-width: 300px; max-width: 400px; padding: 1rem; background: var(--bg-tertiary); border-radius: 8px; text-align: left;">
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem;">Version ${versionNum}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); font-weight: normal;">${escapeHtml(date)}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem; font-weight: normal;">
                    <div>Tokens: ${version.total_tokens_input || 0} in / ${version.total_tokens_output || 0} out</div>
                    <div>Cost: $${(version.total_cost || 0).toFixed(4)}</div>
                </div>
            </th>
        `;
    });
    
    html += '</tr></thead><tbody>';
    
    // Body rows - one row per step
    for (let stepIdx = 0; stepIdx < maxSteps; stepIdx++) {
        html += '<tr style="vertical-align: top;">';
        
        // Step label (sticky)
        html += `
            <td style="min-width: 120px; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; font-weight: 600; color: var(--text-primary); position: sticky; left: 0; z-index: 4;">
                Step ${stepIdx + 1}
            </td>
        `;
        
        // Each version's data for this step
        sortedVersions.forEach(version => {
            const event = version.chain_events && version.chain_events[stepIdx];
            
            if (!event) {
                html += '<td style="min-width: 300px; max-width: 400px; padding: 1rem; background: var(--bg-secondary); border-radius: 8px; color: var(--text-secondary); text-align: center;">N/A</td>';
            } else {
                html += `<td style="min-width: 300px; max-width: 400px; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">`;
                
                // Model info
                html += `<div style="font-weight: 500; color: var(--accent-color); margin-bottom: 0.5rem; font-size: 0.9rem;">${escapeHtml(event.model || 'Unknown model')}</div>`;
                
                // Prompt (truncated)
                const prompt = event.user_prompt || '';
                const truncatedPrompt = prompt.length > 150 ? prompt.substring(0, 150) + '...' : prompt;
                html += `<div style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.75rem; line-height: 1.4;">${escapeHtml(truncatedPrompt)}</div>`;
                
                // Response (truncated)
                const response = typeof event.assistant_response === 'object' ? JSON.stringify(event.assistant_response, null, 2) : String(event.assistant_response || '');
                const truncatedResponse = response.length > 200 ? response.substring(0, 200) + '...' : response;
                html += `<div style="background: var(--bg-tertiary); padding: 0.75rem; border-radius: 6px; margin-bottom: 0.75rem; font-size: 0.85rem; max-height: 200px; overflow-y: auto;"><pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: 'Courier New', monospace; color: var(--text-primary);">${escapeHtml(truncatedResponse)}</pre></div>`;
                
                // Metrics
                if (event.metrics) {
                    html += `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.75rem;">`;
                    html += `<div>Tokens: ${event.metrics.tokens?.input || 0} / ${event.metrics.tokens?.output || 0}</div>`;
                    html += `<div>Cost: $${(event.metrics.cost || 0).toFixed(4)}</div>`;
                    html += `<div>Latency: ${event.metrics.latency || 'N/A'}</div>`;
                    html += `</div>`;
                }
                
                // Rating display
                if (event.rating) {
                    const rating = typeof event.rating === 'object' ? event.rating : {overall: event.rating};
                    html += `<div style="background: var(--bg-primary); padding: 0.75rem; border-radius: 6px; border-left: 3px solid var(--accent-color);">`;
                    html += `<div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem;">⭐ Rating</div>`;
                    
                    if (rating.overall) {
                        html += `<div style="color: var(--accent-color); font-weight: 600; font-size: 1.1rem; margin-bottom: 0.5rem;">Overall: ${rating.overall}/10</div>`;
                    }
                    
                    if (rating.parameters && Object.keys(rating.parameters).length > 0) {
                        html += `<div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">`;
                        Object.keys(rating.parameters).forEach(param => {
                            html += `<div style="margin-bottom: 0.25rem;"><span style="color: var(--text-primary);">${escapeHtml(param)}:</span> ${rating.parameters[param]}/10</div>`;
                        });
                        html += `</div>`;
                    }
                    
                    if (rating.review) {
                        html += `<div style="margin-top: 0.5rem; padding: 0.5rem; background: var(--bg-tertiary); border-radius: 4px; font-size: 0.85rem; color: var(--text-primary); font-style: italic;">"${escapeHtml(rating.review)}"</div>`;
                    }
                    
                    html += `</div>`;
                } else {
                    html += `<div style="color: var(--text-secondary); font-size: 0.85rem; text-align: center; padding: 0.5rem; background: var(--bg-tertiary); border-radius: 6px;">No rating</div>`;
                }
                
                html += '</td>';
            }
        });
        
        html += '</tr>';
    }
    
    html += '</tbody></table></div>';
    
    // Summary section
    html += '<div style="margin-top: 2rem; padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">';
    html += '<h4 style="margin: 0 0 1rem 0; color: var(--text-primary);">Summary</h4>';
    html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">';
    
    sortedVersions.forEach((version, idx) => {
        const versionNum = idx + 1;
        const avgRating = calculateVersionAverageRating(version);
        const totalSteps = version.chain_events ? version.chain_events.length : 0;
        const ratedSteps = version.chain_events ? version.chain_events.filter(e => e.rating).length : 0;
        
        html += `
            <div style="padding: 1rem; background: var(--bg-tertiary); border-radius: 6px;">
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem;">Version ${versionNum}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">
                    <div>Steps: ${totalSteps}</div>
                    <div>Rated: ${ratedSteps}/${totalSteps}</div>
                    ${avgRating !== null ? `<div style="color: var(--accent-color); font-weight: 600; margin-top: 0.5rem;">Avg Rating: ${avgRating.toFixed(1)}/10</div>` : '<div style="margin-top: 0.5rem;">No ratings</div>'}
                </div>
            </div>
        `;
    });
    
    html += '</div></div>';
    
    return html;
}

function calculateVersionAverageRating(version) {
    if (!version.chain_events) return null;
    
    const ratings = [];
    version.chain_events.forEach(event => {
        if (event.rating) {
            const rating = typeof event.rating === 'object' ? event.rating : {overall: event.rating};
            if (rating.overall) {
                ratings.push(rating.overall);
            }
        }
    });
    
    if (ratings.length === 0) return null;
    
    const sum = ratings.reduce((a, b) => a + b, 0);
    return sum / ratings.length;
}

async function loadChainVersions(traceId, preserveSelection = false) {
    if (!traceId) {
            return;
        }

    try {
        const versions = await API.getChainVersions(traceId);

        const versionsDropdown = document.getElementById('versions-dropdown');
        if (!versionsDropdown) return;

        // Preserve current selection if requested
        const currentSelection = preserveSelection ? versionsDropdown.value : null;

        // Sort versions by created_at in ascending order (oldest first)
        const sortedVersions = [...versions].sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateA - dateB; // Ascending order
        });

        window.allChainVersions = sortedVersions;

        // Clear and populate dropdown
        versionsDropdown.innerHTML = '';

        if (sortedVersions.length === 0) {
            versionsDropdown.innerHTML = '<option value="">No saved versions</option>';
            return;
        }

        // Add each version as an option (now in ascending order - oldest first)
        let versionNumber = 1;
        sortedVersions.forEach((version, index) => {
            const option = document.createElement('option');
            const isInitial = version.version_id.endsWith('_initial');
            const date = new Date(version.created_at).toLocaleString();
            // INITIAL is always "INITIAL", others are V1, V2, V3... in chronological order
            const badge = isInitial ? 'INITIAL' : `V${versionNumber++}`;
            
            // Count rated steps for display
            let ratingText = '';
            if (version.chain_events && Array.isArray(version.chain_events)) {
                                let ratedSteps = 0;
                                let totalOverallRating = 0;
                                
                                    version.chain_events.forEach(event => {
                                        if (event.rating) {
                                            ratedSteps++;
                                            const rating = typeof event.rating === 'object' ? event.rating : {overall: event.rating};
                                            if (rating.overall) {
                                                totalOverallRating += rating.overall;
                                            }
                                        }
                                    });
                                
                if (ratedSteps > 0) {
                    const avgRating = Math.round(totalOverallRating / ratedSteps);
                    ratingText = ` ★ ${avgRating}/10 (${ratedSteps} step${ratedSteps !== 1 ? 's' : ''})`;
                }
            }
            
            option.value = version.version_id;
            option.textContent = `${badge} - ${escapeHtml(version.chain_name)}${ratingText} - ${date}`;
            option.setAttribute('data-version-id', version.version_id);
            versionsDropdown.appendChild(option);
        });

        // Restore previous selection if it exists, otherwise select the first version
        if (preserveSelection && currentSelection) {
            versionsDropdown.value = currentSelection;
        } else if (sortedVersions.length > 0) {
            // Default to first version (oldest)
            versionsDropdown.value = sortedVersions[0].version_id;
            // Auto-load the first version (this will be the default view)
            loadChainVersion(sortedVersions[0].version_id);
        }

        console.log(`Loaded ${sortedVersions.length} chain versions for trace ${traceId}`);
    } catch (error) {
        console.error('Error loading chain versions:', error);
        const versionsDropdown = document.getElementById('versions-dropdown');
        if (versionsDropdown) {
            versionsDropdown.innerHTML = '<option value="">Error loading versions</option>';
    }
}
}

function onVersionSelected() {
    const dropdown = document.getElementById('versions-dropdown');
    if (!dropdown || !dropdown.value) {
        return;
    }
    
    const versionId = dropdown.value;
    loadChainVersion(versionId);
}

function openMetadataModal() {
    const modal = document.getElementById('metadata-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Ensure metadata is displayed
        if (currentData && currentData.metadata) {
            displayMetadata(currentData.metadata);
        }
    }
}

function closeMetadataModal() {
    const modal = document.getElementById('metadata-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Image Modal Functions
function openImageModal(imageUrl) {
    const modal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    
    if (modal && modalImage) {
        modalImage.src = imageUrl;
        modal.style.display = 'flex';
        // Prevent body scroll when modal is open
        document.body.style.overflow = 'hidden';
    }
}

function closeImageModal() {
    const modal = document.getElementById('image-modal');
    if (modal) {
        modal.style.display = 'none';
        // Restore body scroll
        document.body.style.overflow = 'auto';
    }
}

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeImageModal();
    }
});

// Toggle Easy View
function toggleEasyView() {
    easyViewEnabled = !easyViewEnabled;
    
    // Update button appearance
    const toggleBtn = document.getElementById('easy-view-toggle');
    const icon = document.getElementById('easy-view-icon');
    
    if (toggleBtn) {
        if (easyViewEnabled) {
            toggleBtn.classList.remove('control-btn');
            toggleBtn.classList.add('control-btn', 'primary');
            if (icon) {
                icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>';
            }
        } else {
            toggleBtn.classList.remove('control-btn', 'primary');
            toggleBtn.classList.add('control-btn');
            if (icon) {
                icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>';
            }
        }
    }
    
    // Re-render all responses with new view mode
    if (currentData && currentData.is_chain && currentData.events) {
        currentData.events.forEach((event, index) => {
            const responseDiv = document.getElementById(`chain-response-${index}`);
            if (responseDiv && event.assistant_response && typeof event.assistant_response === 'object') {
                responseDiv.innerHTML = renderChainResponseWithRatings(event.assistant_response, index, event.rating);
                attachRatingAutoSaveListeners(index);
            }
        });
    }
}

// Initialize Easy View toggle on page load
function initEasyViewToggle() {
    const toggleBtn = document.getElementById('easy-view-toggle');
    if (toggleBtn && easyViewEnabled) {
        toggleBtn.classList.add('primary');
    }
}

// Toggle Response Collapse/Expand
function toggleChainResponse(promptIndex) {
    const content = document.getElementById(`chain-response-content-${promptIndex}`);
    const icon = document.getElementById(`chain-collapse-icon-${promptIndex}`);
    
    if (!content || !icon) return;
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.style.transform = 'rotate(0deg)';
    } else {
        content.style.display = 'none';
        icon.style.transform = 'rotate(-90deg)';
    }
}

// Input Overlay Functions
function openChainInputOverlay(promptIndex) {
    const modal = document.getElementById('input-overlay-modal');
    const content = document.getElementById('input-overlay-content');
    const userPanel = document.getElementById(`chain-user-panel-${promptIndex}`);
    
    if (!modal || !content || !userPanel) return;
    
    // Clone the user panel content to the modal
    content.innerHTML = '';
    const clonedPanel = userPanel.cloneNode(true);
    clonedPanel.style.display = 'block'; // Show in modal
    clonedPanel.id = `chain-user-panel-${promptIndex}-clone`;
    content.appendChild(clonedPanel);
    
    // Re-attach event listeners to cloned elements
    const providerSelect = clonedPanel.querySelector(`.chain-provider-select[data-prompt-index="${promptIndex}"]`);
    const modelSelect = clonedPanel.querySelector(`.chain-model-select[data-prompt-index="${promptIndex}"]`);
    const regenerateBtn = clonedPanel.querySelector(`.chain-regenerate-btn[data-prompt-index="${promptIndex}"]`);
    
    if (providerSelect && modelSelect) {
        providerSelect.addEventListener('change', () => {
            const event = currentData.events[promptIndex];
            populateChainModelSelect(modelSelect, event.model, promptIndex, providerSelect.value);
        });
        populateChainModelSelect(modelSelect, currentData.events[promptIndex].model, promptIndex, providerSelect.value);
    }
    
    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', async () => {
            try {
                syncInputOverlayChanges(); // Sync changes before regenerating
                await regenerateSingleChainPrompt(promptIndex);
                closeChainInputOverlay(); // Close after regeneration
            } catch (error) {
                showError(error.message);
            }
        });
    }
    
    modal.style.display = 'flex';
}

function closeChainInputOverlay() {
    syncInputOverlayChanges(); // Sync changes before closing
    
    const modal = document.getElementById('input-overlay-modal');
    const content = document.getElementById('input-overlay-content');
    
    if (modal) modal.style.display = 'none';
    if (content) content.innerHTML = '';
}

function syncInputOverlayChanges() {
    const modalContent = document.getElementById('input-overlay-content');
    if (!modalContent) return;
    
    // Find the cloned panel
    const clonedPanel = modalContent.querySelector('[id^="chain-user-panel-"][id$="-clone"]');
    if (!clonedPanel) return;
    
    // Extract prompt index from cloned panel ID
    const match = clonedPanel.id.match(/chain-user-panel-(\d+)-clone/);
    if (!match) return;
    
    const promptIndex = parseInt(match[1]);
    const originalPanel = document.getElementById(`chain-user-panel-${promptIndex}`);
    if (!originalPanel) return;
    
    // Sync textarea value
    const clonedTextarea = clonedPanel.querySelector(`.chain-prompt-input[data-prompt-index="${promptIndex}"]`);
    const originalTextarea = originalPanel.querySelector(`.chain-prompt-input[data-prompt-index="${promptIndex}"]`);
    if (clonedTextarea && originalTextarea) {
        originalTextarea.value = clonedTextarea.value;
    }
    
    // Sync schema editor
    const clonedSchema = clonedPanel.querySelector(`.chain-schema-editor[data-prompt-index="${promptIndex}"]`);
    const originalSchema = originalPanel.querySelector(`.chain-schema-editor[data-prompt-index="${promptIndex}"]`);
    if (clonedSchema && originalSchema) {
        originalSchema.value = clonedSchema.value;
    }
    
    // Sync provider and model selects
    const clonedProvider = clonedPanel.querySelector(`.chain-provider-select[data-prompt-index="${promptIndex}"]`);
    const originalProvider = originalPanel.querySelector(`.chain-provider-select[data-prompt-index="${promptIndex}"]`);
    if (clonedProvider && originalProvider) {
        originalProvider.value = clonedProvider.value;
    }
    
    const clonedModel = clonedPanel.querySelector(`.chain-model-select[data-prompt-index="${promptIndex}"]`);
    const originalModel = originalPanel.querySelector(`.chain-model-select[data-prompt-index="${promptIndex}"]`);
    if (clonedModel && originalModel) {
        originalModel.value = clonedModel.value;
    }
    
    // Update currentData with prompt changes
    if (originalTextarea && currentData && currentData.events && currentData.events[promptIndex]) {
        currentData.events[promptIndex].user_prompt = originalTextarea.value;
    }
}

// Close modals when clicking outside
document.addEventListener('click', (e) => {
    const inputOverlayModal = document.getElementById('input-overlay-modal');
    if (inputOverlayModal && inputOverlayModal.style.display === 'flex' && e.target === inputOverlayModal) {
        closeChainInputOverlay();
    }
    
    const metadataModal = document.getElementById('metadata-modal');
    if (metadataModal && metadataModal.style.display === 'flex' && e.target === metadataModal) {
        closeMetadataModal();
    }
    
    const ratingModal = document.getElementById('rating-modal');
    if (ratingModal && ratingModal.style.display === 'flex' && e.target === ratingModal) {
        closeRatingModal();
    }
});

async function loadChainVersion(versionId) {
    if (!window.allChainVersions) return;
    
    const version = window.allChainVersions.find(v => v.version_id === versionId);
    if (!version) return;
    
    // Show full-page processing state
    const versionsSection = document.getElementById('versions-section');
    const metadataCard = document.querySelector('.metadata-card');
    const chainContainer = document.getElementById('chain-container');
    
    // Store original display states
    const originalVersionsDisplay = versionsSection ? versionsSection.style.display : '';
    const originalMetadataDisplay = metadataCard ? metadataCard.style.display : '';
    
    // Create full-page processing overlay
    const processingOverlay = document.createElement('div');
    processingOverlay.id = 'chain-loading-overlay';
    processingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--bg-primary);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 2rem;
    `;
    processingOverlay.innerHTML = `
        <div class="spinner" style="margin-bottom: 2rem; width: 48px; height: 48px;"></div>
        <h2 style="color: var(--text-primary); font-size: 1.5rem; font-weight: 600; margin: 0 0 0.5rem 0;">Loading Chain Version</h2>
        <p style="color: var(--text-secondary); font-size: 1rem; margin: 0 0 0.25rem 0;">Preparing chain data...</p>
        <p style="color: var(--text-tertiary); font-size: 0.9rem; margin: 0;">Loading saved version from database</p>
    `;
    document.body.appendChild(processingOverlay);
    
    currentData = {
        is_chain: true,
        trace_id: version.trace_id,
        chain_name: version.chain_name,
        events: version.chain_events,
        metadata: version.metadata || {}
    };
    
    // Small delay to ensure processing state is visible
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Remove overlay before displaying
    if (processingOverlay.parentNode) {
        processingOverlay.parentNode.removeChild(processingOverlay);
    }
    
    displayChain(currentData);
    
    // Ensure dropdown shows the selected version after displayChain reloads versions
    // Use setTimeout to ensure dropdown is populated first
    setTimeout(() => {
        const dropdown = document.getElementById('versions-dropdown');
        if (dropdown && versionId) {
            dropdown.value = versionId;
}
    }, 100);
    
    console.log('Loaded chain version:', versionId);
}

// Old view switching functions removed - using dropdown now

