// Chain page logic

let currentData = null;

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

// Store pending ratings in memory (not saved to DB yet)
let pendingRatings = {};

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

function savePendingRating(stepIndex) {
    // Save current rating inputs to pending ratings before switching steps
    if (!currentData || stepIndex === null || stepIndex === undefined) return;
    
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
    
    // Only save if at least one field is filled
    if (overall || Object.keys(parameters).length > 0 || review) {
        const rating = {};
        if (overall) rating.overall = overall;
        if (Object.keys(parameters).length > 0) rating.parameters = parameters;
        if (review) rating.review = review;
        
        pendingRatings[stepIndex] = rating;
        console.log(`Saved pending rating for step ${stepIndex}:`, rating);
    } else {
        // Clear pending rating if all fields are empty
        delete pendingRatings[stepIndex];
    }
}

function loadPendingRating(stepIndex) {
    // Load pending rating if exists
    if (pendingRatings[stepIndex]) {
        const rating = pendingRatings[stepIndex];
        
        const overallRating = document.getElementById('chain-overall-rating');
        const reviewText = document.getElementById('chain-rating-review');
        
        if (overallRating && rating.overall) {
            overallRating.value = rating.overall;
        }
        if (reviewText && rating.review) {
            reviewText.value = rating.review;
        }
        
        // Load parameter ratings
        if (rating.parameters) {
            Object.keys(rating.parameters).forEach(paramName => {
                const input = document.querySelector(`.chain-param-rating-input[data-param="${CSS.escape(paramName)}"]`);
                if (input) {
                    input.value = rating.parameters[paramName];
                }
            });
        }
        
        console.log(`Loaded pending rating for step ${stepIndex}:`, rating);
        return true;
    }
    return false;
}

function clearPendingRatings() {
    pendingRatings = {};
    console.log('Cleared all pending ratings');
}

function openRatingModal() {
    const modal = document.getElementById('rating-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Populate selector and restore saved step (don't reset dropdown, restore from storage)
        populateChainStepSelector(false);
        
        // Restore pending ratings if they exist
        const selector = document.getElementById('chain-step-selector');
        if (selector && selector.value) {
            const selectedIndex = parseInt(selector.value);
            if (!isNaN(selectedIndex)) {
                loadPendingRating(selectedIndex);
            }
        }
    }
}

function closeRatingModal() {
    // Save current rating before closing
    const selector = document.getElementById('chain-step-selector');
    const currentIndex = selector && selector.value ? parseInt(selector.value) : null;
    if (!isNaN(currentIndex)) {
        savePendingRating(currentIndex);
    }
    
    const modal = document.getElementById('rating-modal');
    if (modal) {
        modal.style.display = 'none';
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
            // Trigger the change event to load the step data
            setTimeout(() => onChainStepSelected(), 100);
        }
    }
}

function onChainStepSelected() {
    const selector = document.getElementById('chain-step-selector');
    const container = document.getElementById('chain-step-rating-container');
    
    if (!selector || !container) return;
    
    // Save current rating before switching
    const previousIndex = selector ? parseInt(selector.dataset.previousValue || '') : null;
    if (!isNaN(previousIndex)) {
        savePendingRating(previousIndex);
    }
    
    const selectedIndex = parseInt(selector.value);
    
    if (isNaN(selectedIndex) || !currentData || !currentData.events || selectedIndex < 0 || selectedIndex >= currentData.events.length) {
        container.style.display = 'none';
        saveSelectedStepToStorage(null); // Clear saved step
        return;
    }
    
    // Store current selection for next change
    selector.dataset.previousValue = selectedIndex.toString();
    
    // Save the selected step to localStorage
    saveSelectedStepToStorage(selectedIndex);
    
    const selectedEvent = currentData.events[selectedIndex];
    container.style.display = 'block';
    
    // Populate parameter ratings for this specific step
    populateChainParameterRatings(selectedEvent);
    
    // First try to load pending rating (unsaved changes)
    const hasPendingRating = loadPendingRating(selectedIndex);
    
    if (!hasPendingRating) {
        // If no pending rating, load existing saved rating
        if (selectedEvent.rating) {
            const ratingData = typeof selectedEvent.rating === 'object' ? selectedEvent.rating : {overall: selectedEvent.rating};
            
            const overallRating = document.getElementById('chain-overall-rating');
            const reviewText = document.getElementById('chain-rating-review');
            
            if (overallRating && ratingData.overall) {
                overallRating.value = ratingData.overall;
            }
            if (reviewText && ratingData.review) {
                reviewText.value = ratingData.review;
            }
            
            // Load parameter ratings
            if (ratingData.parameters) {
                Object.keys(ratingData.parameters).forEach(paramName => {
                    const input = document.querySelector(`.chain-param-rating-input[data-param="${CSS.escape(paramName)}"]`);
                    if (input) {
                        input.value = ratingData.parameters[paramName];
                    }
                });
            }
        } else {
            // Clear inputs if no rating exists
            const overallRating = document.getElementById('chain-overall-rating');
            const reviewText = document.getElementById('chain-rating-review');
            if (overallRating) overallRating.value = '';
            if (reviewText) reviewText.value = '';
        }
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
    
    // Create tabbed interface
    const tabsContainer = document.createElement('div');
    tabsContainer.id = 'chain-tabs-container';
    tabsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 1rem;';
    
    // Create tab content container
    const tabContentContainer = document.createElement('div');
    tabContentContainer.id = 'chain-tab-content';
    tabContentContainer.style.cssText = 'position: relative; min-height: 400px;';
    
    // Create all tab content (initially hidden)
    chainData.events.forEach((event, index) => {
        const promptPanels = createChainPromptPanels(event, index, chainData.events.length);
        promptPanels.style.display = index === 0 ? 'block' : 'none'; // Show first tab by default
        promptPanels.className += ' chain-tab-content-item'; // Add tab class without removing existing
        tabContentContainer.appendChild(promptPanels);
    });
    
    tabsContainer.appendChild(tabContentContainer);
    
    chainContainer.appendChild(tabsContainer);
    
    // Initialize tab state
    window.currentChainTabIndex = 0;
    updateChainTabNavigation(chainData.events.length);
    
    loadChainVersions(chainData.trace_id, true); // Preserve selection when reloading
}

function switchChainTab(newIndex) {
    if (!currentData || !currentData.events) return;
    
    const totalTabs = currentData.events.length;
    if (newIndex < 0 || newIndex >= totalTabs) return;
    
    // Hide all tab content
    const allTabContent = document.querySelectorAll('.chain-tab-content-item');
    allTabContent.forEach((content, index) => {
        content.style.display = index === newIndex ? 'block' : 'none';
    });
    
    window.currentChainTabIndex = newIndex;
    updateChainTabNavigation(totalTabs);
}

function updateChainTabNavigation(totalTabs) {
    const currentIndex = window.currentChainTabIndex || 0;
    
    // Update all prev/next buttons visibility based on current tab
    for (let i = 0; i < totalTabs; i++) {
        const prevButton = document.getElementById(`chain-tab-prev-${i}`);
        const nextButton = document.getElementById(`chain-tab-next-${i}`);
        
        if (prevButton) {
            prevButton.style.display = i === 0 ? 'none' : (i === currentIndex ? 'inline-block' : 'none');
        }
        
        if (nextButton) {
            nextButton.style.display = i >= totalTabs - 1 ? 'none' : (i === currentIndex ? 'inline-block' : 'none');
        }
    }
}

function createChainPromptPanels(event, index, totalPrompts) {
    const promptWrapper = document.createElement('div');
    promptWrapper.className = 'chain-prompt-wrapper';
    promptWrapper.id = `chain-prompt-${index}`;
    promptWrapper.style.marginBottom = '0';
    
    const promptLabel = document.createElement('div');
    promptLabel.id = `chain-title-${index}`;
    promptLabel.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 6px;';
    
    const titleLeft = document.createElement('div');
    titleLeft.style.cssText = 'display: flex; align-items: center; gap: 0.75rem;';
    
    // Previous button (only show if not first)
    const prevButton = document.createElement('button');
    prevButton.id = `chain-tab-prev-${index}`;
    prevButton.className = 'control-btn';
    prevButton.style.cssText = 'padding: 0.4rem 0.75rem; font-size: 0.9rem;';
    prevButton.textContent = 'Previous';
    prevButton.onclick = () => switchChainTab(index - 1);
    prevButton.style.display = index === 0 ? 'none' : 'inline-block';
    
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
    
    titleText.innerHTML = `<span style="color: var(--accent-primary);">Response ${index + 1}/${totalPrompts}</span> - ${escapeHtml(event.name || 'Unknown')}${ratingBadge}`;
    
    // Next button (only show if not last)
    const nextButton = document.createElement('button');
    nextButton.id = `chain-tab-next-${index}`;
    nextButton.className = 'control-btn';
    nextButton.style.cssText = 'padding: 0.4rem 0.75rem; font-size: 0.9rem;';
    nextButton.textContent = 'Next';
    nextButton.onclick = () => switchChainTab(index + 1);
    nextButton.style.display = index >= totalPrompts - 1 ? 'none' : 'inline-block';
    
    titleLeft.appendChild(prevButton);
    titleLeft.appendChild(titleText);
    
    promptLabel.appendChild(titleLeft);
    promptLabel.appendChild(nextButton);
    promptWrapper.appendChild(promptLabel);
    
    const splitView = document.createElement('div');
    splitView.className = 'split-view';
    splitView.style.display = 'grid';
    splitView.style.gridTemplateColumns = '1fr 1fr';
    splitView.style.gap = '2rem';
    
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
            <div class="panel-title">
                <svg class="panel-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                </svg>
                <span>Assistant Response</span>
            </div>
            <div class="panel-controls">
                <!-- Per-prompt rating removed - use chain-level rating instead -->
            </div>
        </div>
        <div class="panel-content">
            <div class="chain-response-display" id="chain-response-${index}"></div>
        </div>
    `;
    
    splitView.appendChild(userPanel);
    splitView.appendChild(assistantPanel);
    promptWrapper.appendChild(splitView);
    
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
        responseDiv.innerHTML = renderJSONAsTable(assistantResponse);
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
        if (assistantResponse && typeof assistantResponse === 'object' && !Array.isArray(assistantResponse)) {
            responseDiv.innerHTML = renderJSONAsTable(assistantResponse);
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
        
        // Switch to this tab during regeneration
        switchChainTab(i);
        
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
                if (assistantResponse && typeof assistantResponse === 'object' && !Array.isArray(assistantResponse)) {
                    responseDiv.innerHTML = renderJSONAsTable(assistantResponse);
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
            promptLabel.innerHTML = `<span style="color: var(--accent-primary);">Response ${stepIndex + 1}/${currentData.events.length}</span> - ${escapeHtml(event.name || 'Unknown')}${ratingBadge}`;
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
    
    // Collect rating data (optional) - returns {stepIndex, rating} or null
    const ratingData = collectChainRatingData();
    
    if (!ratingData || ratingData.stepIndex === undefined) {
        showError('Please select a response step to rate');
        return;
    }
    
    try {
        await API.updateChainStepRating({
            version_id: versionId,
            step_index: ratingData.stepIndex,
            rating: ratingData.rating || null
        });
        
        // Update currentData with the new rating
        if (currentData.events[ratingData.stepIndex]) {
            if (ratingData.rating) {
                currentData.events[ratingData.stepIndex].rating = ratingData.rating;
            } else {
                delete currentData.events[ratingData.stepIndex].rating;
            }
        }
        
        // Refresh the UI
        refreshRatingBadge(ratingData.stepIndex);
        showSuccess(`Rating updated for Response ${ratingData.stepIndex + 1}!`);
        
        // Reload versions to refresh the list
        loadChainVersions(currentData.trace_id, true);
        
        // Clear rating inputs but keep the step selected
        const overallRating = document.getElementById('chain-overall-rating');
        const reviewText = document.getElementById('chain-rating-review');
        const paramInputs = document.querySelectorAll('.chain-param-rating-input');
        if (overallRating) overallRating.value = '';
        if (reviewText) reviewText.value = '';
        paramInputs.forEach(input => input.value = '');
        
        // Reload the step data to show the updated rating
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
    
    // Save current rating to pending before saving version
    const selector = document.getElementById('chain-step-selector');
    const currentIndex = selector && selector.value ? parseInt(selector.value) : null;
    if (!isNaN(currentIndex)) {
        savePendingRating(currentIndex);
    }
    
    // Create a copy of events to avoid mutating currentData
    const eventsToSave = currentData.events.map(event => ({...event}));
    
    // Apply all pending ratings to the events
    Object.keys(pendingRatings).forEach(stepIdx => {
        const index = parseInt(stepIdx);
        if (!isNaN(index) && eventsToSave[index]) {
            eventsToSave[index].rating = pendingRatings[stepIdx];
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
        Object.keys(pendingRatings).forEach(stepIdx => {
            const index = parseInt(stepIdx);
            if (!isNaN(index) && currentData.events[index]) {
                currentData.events[index].rating = pendingRatings[stepIdx];
                refreshRatingBadge(index);
            }
        });
        
        // Clear pending ratings after successful save
        clearPendingRatings();
        
        loadChainVersions(currentData.trace_id, true); // Preserve selection after saving
        
        // Clear rating inputs and close modal
        const selector = document.getElementById('chain-step-selector');
        const overallRating = document.getElementById('chain-overall-rating');
        const reviewText = document.getElementById('chain-rating-review');
        const paramInputs = document.querySelectorAll('.chain-param-rating-input');
        if (selector) {
            selector.value = '';
            delete selector.dataset.previousValue;
        }
        if (overallRating) overallRating.value = '';
        if (reviewText) reviewText.value = '';
        paramInputs.forEach(input => input.value = '');
        const container = document.getElementById('chain-step-rating-container');
        if (container) container.style.display = 'none';
        closeRatingModal(); // Close the rating modal after saving
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

// Close modals when clicking outside
document.addEventListener('click', (e) => {
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

