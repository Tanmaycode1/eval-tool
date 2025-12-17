// Generation page logic

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

function toggleSchema() {
    const schemaContent = document.getElementById('schema-content');
    const collapseBtn = document.querySelector('.schema-header .collapse-btn');
    
    if (schemaContent.style.display === 'none') {
        schemaContent.style.display = 'block';
        if (collapseBtn) collapseBtn.textContent = 'Collapse';
    } else {
        schemaContent.style.display = 'none';
        if (collapseBtn) collapseBtn.textContent = 'Expand';
    }
}

function toggleRatingPanel() {
    const ratingSection = document.getElementById('rating-section');
    const ratingContent = document.getElementById('rating-content');
    const toggleBtn = document.getElementById('rating-toggle-btn');
    
    if (ratingSection && ratingContent) {
        if (ratingSection.style.display === 'none') {
            ratingSection.style.display = 'block';
            if (toggleBtn) toggleBtn.textContent = 'Collapse';
            populateParameterRatings();
        } else {
            ratingSection.style.display = 'none';
            if (toggleBtn) toggleBtn.textContent = 'Expand';
        }
    }
}

function populateParameterRatings() {
    if (!currentData || !currentData.assistant_response) return;
    
    const container = document.getElementById('parameter-ratings-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Extract top-level keys from response
    const response = currentData.assistant_response;
    const keys = Object.keys(response);
    
    if (keys.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No parameters found in response</p>';
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
                <input type="number" class="param-rating-input" data-param="${escapeHtml(key)}" min="1" max="10" placeholder="1-10" style="width: 100px; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary);">
            `;
            container.appendChild(paramDiv);
        } else if (typeof value === 'string' || typeof value === 'number' || Array.isArray(value)) {
            const paramDiv = document.createElement('div');
            paramDiv.style.cssText = 'display: flex; align-items: center; gap: 1rem; padding: 0.5rem; background: var(--bg-primary); border-radius: 4px;';
            paramDiv.innerHTML = `
                <label style="flex: 1; color: var(--text-primary); font-size: 0.9rem;">${escapeHtml(key)}</label>
                <input type="number" class="param-rating-input" data-param="${escapeHtml(key)}" min="1" max="10" placeholder="1-10" style="width: 100px; padding: 0.4rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary);">
            `;
            container.appendChild(paramDiv);
        }
    });
    
    if (container.children.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No rateable parameters found</p>';
    }
}

function collectRatingData() {
    const overallRating = document.getElementById('overall-rating');
    const reviewText = document.getElementById('rating-review');
    const paramInputs = document.querySelectorAll('.param-rating-input');
    
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
        return rating;
    }
    
    return null; // No rating provided
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

    const metadataItems = [
        { label: 'Event ID', value: metadata.event_id || 'N/A' },
        { label: 'Model', value: metadata.model || 'N/A' },
        { label: 'Provider', value: metadata.provider || 'N/A' },
        { label: 'Latency', value: latencyDisplay },
        { label: 'Input Tokens', value: metadata.input_tokens || 0 },
        { label: 'Output Tokens', value: metadata.output_tokens || 0 },
        { label: 'Total Cost', value: costDisplay },
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

async function loadGeneration(eventId) {
    showLoading(true);
    hideError();

    try {
        // Try to fetch from API first
        const data = await API.processInput(eventId);
        
        // If it's a chain, redirect
        if (data.is_chain && data.trace_id) {
            window.location.href = `/prompt-chain/${data.trace_id}`;
            return;
        }
        
        displayGeneration(data);
    } catch (error) {
        // If API fetch fails, try to load from database versions
        try {
            const versions = await API.getVersions(eventId);
            if (versions.length > 0) {
                const latestVersion = versions[0];
                loadVersion(latestVersion);
                loadVersions(eventId);
                return;
            }
        } catch (dbError) {
            console.error('DB load error:', dbError);
        }
        
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

function displayGeneration(data) {
    console.log('Displaying generation...');
    
    currentData = data;
    
    const model = data.metadata.model || '';
    let defaultProvider = '';
    let defaultModel = '';
    
    if (model.includes('gpt')) {
        defaultProvider = 'openai';
        defaultModel = model;
    } else if (model.includes('claude')) {
        defaultProvider = 'anthropic';
        defaultModel = model;
    } else if (model.includes('gemini')) {
        defaultProvider = 'gemini';
        defaultModel = model;
    }
    
    if (defaultProvider) {
        const providerSelect = document.getElementById('provider-select');
        if (providerSelect) {
            providerSelect.value = defaultProvider;
            updateModelSelect();
            const modelSelect = document.getElementById('model-select');
            if (modelSelect && defaultModel) {
                modelSelect.value = defaultModel;
            }
        }
    }
    
    displayMetadata(data.metadata);
    
    // Populate parameter ratings if rating section is visible
    const ratingSection = document.getElementById('rating-section');
    if (ratingSection && ratingSection.style.display !== 'none') {
        populateParameterRatings();
    }
    
    // Extract and display schema if available
    const schemaSection = document.getElementById('schema-section');
    const schemaEditor = document.getElementById('schema-editor');
    if (data.properties && data.properties.prompt_schema) {
        if (schemaSection) schemaSection.style.display = 'block';
        if (schemaEditor) {
            // Pretty print the schema for readability
            let schemaStr = data.properties.prompt_schema;
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
    } else if (data.raw_properties && data.raw_properties.prompt_schema) {
        if (schemaSection) schemaSection.style.display = 'block';
        if (schemaEditor) {
            // Pretty print the schema for readability
            let schemaStr = data.raw_properties.prompt_schema;
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
    } else {
        if (schemaSection) schemaSection.style.display = 'none';
    }

    const imagesDisplay = document.getElementById('user-images-display');
    if (imagesDisplay) {
        imagesDisplay.innerHTML = '';
        
        if (data.user_images && data.user_images.length > 0) {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'image-container';
            imageContainer.id = 'image-container';
            
            const imageHeader = document.createElement('div');
            imageHeader.className = 'image-header';
            
            const imageLabel = document.createElement('div');
            imageLabel.className = 'image-label';
            imageLabel.textContent = `Attached Images (${data.user_images.length})`;
            
            const collapseBtn = document.createElement('button');
            collapseBtn.className = 'collapse-btn';
            collapseBtn.textContent = 'Collapse';
            collapseBtn.onclick = () => toggleImages();
            
            imageHeader.appendChild(imageLabel);
            imageHeader.appendChild(collapseBtn);
            imageContainer.appendChild(imageHeader);
            
            const imageGallery = document.createElement('div');
            imageGallery.className = 'image-gallery';
            
            data.user_images.forEach((imageUrl, index) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'image-wrapper';
                
                const img = document.createElement('img');
                img.src = imageUrl;
                img.className = 'prompt-image';
                img.alt = `User input image ${index + 1}`;
                img.onclick = () => window.open(imageUrl, '_blank');
                
                if (data.user_images.length > 1) {
                    const badge = document.createElement('div');
                    badge.className = 'image-count-badge';
                    badge.textContent = `${index + 1}/${data.user_images.length}`;
                    wrapper.appendChild(badge);
                }
                
                wrapper.appendChild(img);
                imageGallery.appendChild(wrapper);
            });
            
            imageContainer.appendChild(imageGallery);
            imagesDisplay.appendChild(imageContainer);
        }
    }
    
    const editPrompt = document.getElementById('edit-prompt');
    if (editPrompt) {
        editPrompt.value = data.user_prompt || 'No user prompt available';
    }

    const responsePanel = document.getElementById('assistant-response');
    if (responsePanel) {
        // Process response to strip markdown code blocks
        const processedResponse = processAssistantResponse(data.assistant_response);
        if (processedResponse && typeof processedResponse === 'object' && !Array.isArray(processedResponse)) {
            responsePanel.innerHTML = renderJSONAsTable(processedResponse);
        } else {
            responsePanel.innerHTML = syntaxHighlight(JSON.stringify(processedResponse, null, 2));
        }
    }

    loadVersions(data.metadata.event_id);
}

async function regenerate() {
    if (!currentData) {
        showError('No data loaded. Please load a trace first.');
        return;
    }
    
    const providerSelect = document.getElementById('provider-select');
    const modelSelect = document.getElementById('model-select');
    const editArea = document.getElementById('edit-prompt');
    
    if (!providerSelect || !modelSelect || !editArea) return;
    
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const prompt = editArea.value.trim();
    
    if (!provider || !model) {
        showError('Please select a provider and model');
        return;
    }
    
    if (!prompt) {
        showError('Prompt cannot be empty');
        return;
    }
    
    const responsePanel = document.getElementById('assistant-response');
    const loadingEl = document.getElementById('assistant-response-loading');
    const schemaEditor = document.getElementById('schema-editor');
    
    if (responsePanel) responsePanel.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'block';
    hideError();
    
    // Get schema if provided and validate it
    let responseSchema = null;
    if (schemaEditor && schemaEditor.value.trim()) {
        const validation = validateSchemaJSON(schemaEditor.value.trim());
        if (!validation.valid) {
            if (loadingEl) loadingEl.style.display = 'none';
            if (responsePanel) responsePanel.style.display = 'block';
            showError(`Schema validation failed: ${validation.error}`);
            return;
        }
        responseSchema = validation.schema;
    }
    
    try {
        const result = await API.regenerate({
            event_id: currentData.metadata.event_id,
            provider: provider,
            model: model,
            prompt: prompt,
            image_urls: currentData.user_images,
            response_schema: responseSchema
        });
        
        const newMetadata = {
            ...currentData.metadata,
            ...result.metadata,
            event_id: currentData.metadata.event_id
        };
        
        currentData.assistant_response = result.response;
        currentData.metadata = newMetadata;
        currentData.current_version_id = result.version_id;
        currentData.current_provider = provider;
        currentData.current_model = model;
        currentData.current_prompt = prompt;
        
        displayMetadata(newMetadata);
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (responsePanel) {
            responsePanel.style.display = 'block';
            // Process response to strip markdown code blocks
            const processedResponse = processAssistantResponse(result.assistant_response);
            if (processedResponse && typeof processedResponse === 'object' && !Array.isArray(processedResponse)) {
                responsePanel.innerHTML = renderJSONAsTable(processedResponse);
            } else {
                responsePanel.innerHTML = syntaxHighlight(JSON.stringify(processedResponse, null, 2));
            }
        }
        
        // Clear rating inputs
        const overallRating = document.getElementById('overall-rating');
        const reviewText = document.getElementById('rating-review');
        const paramInputs = document.querySelectorAll('.param-rating-input');
        if (overallRating) overallRating.value = '';
        if (reviewText) reviewText.value = '';
        paramInputs.forEach(input => input.value = '');
        
        console.log('Regenerated successfully');
    } catch (error) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (responsePanel) responsePanel.style.display = 'block';
        showError(error.message);
    }
}

async function addToCompare() {
    if (!currentData) {
        showError('No data to save');
        return;
    }
    
    // Collect rating data (optional)
    const rating = collectRatingData();
    
    const version_id = currentData.current_version_id || `${currentData.metadata.event_id}_initial`;
    const provider = currentData.current_provider || (currentData.metadata.model?.includes('gpt') ? 'openai' : 
                    currentData.metadata.model?.includes('claude') ? 'anthropic' : 
                    currentData.metadata.model?.includes('gemini') ? 'gemini' : 'unknown');
    const model = currentData.current_model || currentData.metadata.model;
    const prompt = currentData.current_prompt || currentData.user_prompt;
    
    try {
        await API.saveVersion({
            version_id: version_id,
            event_id: currentData.metadata.event_id,
            model_provider: provider,
            model_name: model,
            user_prompt: prompt,
            image_urls: currentData.user_images,
            assistant_response: currentData.assistant_response,
            rating: rating,
            metadata: currentData.metadata || {}
        });
        
        showSuccess('Successfully added to compare!');
        console.log('Version saved for comparison');
        
        if (currentData && currentData.metadata) {
            loadVersions(currentData.metadata.event_id);
        }
    } catch (error) {
        showError(error.message);
    }
}

async function loadVersions(eventId) {
    if (!eventId || eventId === 'N/A') {
        return;
    }

    try {
        const versions = await API.getVersions(eventId);

        const versionsSection = document.getElementById('versions-section');
        const versionsList = document.getElementById('versions-list');
        const versionsCount = document.getElementById('versions-count');

        if (!versionsSection || !versionsList || !versionsCount) return;

        if (versions.length === 0) {
            versionsSection.style.display = 'none';
            return;
        }

        versionsSection.style.display = 'block';
        versionsCount.textContent = `${versions.length} version${versions.length !== 1 ? 's' : ''}`;
        versionsList.innerHTML = '';

        window.allVersions = versions;

        versions.forEach((version, index) => {
            const versionItem = document.createElement('div');
            versionItem.className = 'version-item';
            versionItem.id = `version-${version.id}`;
            versionItem.setAttribute('data-version', JSON.stringify(version));

            const isInitial = version.version_id.endsWith('_initial');
            const date = new Date(version.created_at).toLocaleString();

            versionItem.innerHTML = `
                <div class="version-header">
                    <div style="display: flex; align-items: center; flex: 1;">
                        <input type="checkbox" class="version-checkbox" data-version-id="${version.version_id}" onchange="updateComparisonTable()">
                        <div class="version-info" style="flex: 1; cursor: pointer;" onclick="loadVersionFromElement('version-${version.id}')">
                            <span class="version-badge ${isInitial ? 'initial' : ''}">${isInitial ? 'INITIAL' : `V${index + 1}`}</span>
                            <span class="version-model">${escapeHtml(version.model_provider)}/${escapeHtml(version.model_name)}</span>
                            ${version.rating ? `
                                <div class="version-rating" title="${version.rating.review ? escapeHtml(version.rating.review) : ''}">
                                    <span class="rating-star">★</span>
                                    <span>${typeof version.rating === 'object' && version.rating.overall ? `${version.rating.overall}/10` : (typeof version.rating === 'number' ? `${version.rating}/10` : 'Rated')}</span>
                                    ${typeof version.rating === 'object' && version.rating.parameters && Object.keys(version.rating.parameters).length > 0 ? `<span style="font-size: 0.75rem; color: var(--text-secondary); margin-left: 0.25rem;">(${Object.keys(version.rating.parameters).length} params)</span>` : ''}
                                </div>
                            ` : ''}
                            <span class="version-date">${escapeHtml(date)}</span>
                        </div>
                    </div>
                </div>
            `;

            versionsList.appendChild(versionItem);
        });

        switchToListView();

        console.log(`Loaded ${versions.length} versions for event ${eventId}`);
    } catch (error) {
        console.error('Error loading versions:', error);
    }
}

function loadVersionFromElement(elementId) {
    const versionItem = document.getElementById(elementId);
    if (!versionItem) return;

    const versionDataStr = versionItem.getAttribute('data-version');
    if (!versionDataStr) return;

    const versionData = JSON.parse(versionDataStr);
    loadVersion(versionData);
    
    document.querySelectorAll('.version-item').forEach(item => {
        item.classList.remove('selected');
    });

    versionItem.classList.add('selected');
}

function loadVersion(versionData) {
    const editPrompt = document.getElementById('edit-prompt');
    if (editPrompt) {
        editPrompt.value = versionData.user_prompt || '';
    }

    const imagesDisplay = document.getElementById('user-images-display');
    if (imagesDisplay) {
        imagesDisplay.innerHTML = '';
        
        if (versionData.image_urls && versionData.image_urls.length > 0) {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'image-container';
            imageContainer.id = 'image-container';
            imageContainer.style.marginBottom = '1rem';
            imageContainer.style.marginTop = '0';
            
            const imageHeader = document.createElement('div');
            imageHeader.className = 'image-header';
            
            const imageLabel = document.createElement('div');
            imageLabel.className = 'image-label';
            imageLabel.textContent = `Attached Images (${versionData.image_urls.length})`;
            
            const collapseBtn = document.createElement('button');
            collapseBtn.className = 'collapse-btn';
            collapseBtn.textContent = 'Collapse';
            collapseBtn.onclick = () => toggleImages();
            
            imageHeader.appendChild(imageLabel);
            imageHeader.appendChild(collapseBtn);
            imageContainer.appendChild(imageHeader);
            
            const imageGallery = document.createElement('div');
            imageGallery.className = 'image-gallery';
            
            versionData.image_urls.forEach((imageUrl, index) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'image-wrapper';
                
                const img = document.createElement('img');
                img.src = imageUrl;
                img.className = 'prompt-image';
                img.alt = `User input image ${index + 1}`;
                img.onclick = () => window.open(imageUrl, '_blank');
                
                if (versionData.image_urls.length > 1) {
                    const badge = document.createElement('div');
                    badge.className = 'image-count-badge';
                    badge.textContent = `${index + 1}/${versionData.image_urls.length}`;
                    wrapper.appendChild(badge);
                }
                
                wrapper.appendChild(img);
                imageGallery.appendChild(wrapper);
            });
            
            imageContainer.appendChild(imageGallery);
            imagesDisplay.appendChild(imageContainer);
        }
    }

    const responsePanel = document.getElementById('assistant-response');
    if (responsePanel) {
        // Process response to strip markdown code blocks
        const processedResponse = processAssistantResponse(versionData.assistant_response);
        if (processedResponse && typeof processedResponse === 'object' && !Array.isArray(processedResponse)) {
            responsePanel.innerHTML = renderJSONAsTable(processedResponse);
        } else {
            responsePanel.innerHTML = syntaxHighlight(JSON.stringify(processedResponse, null, 2));
        }
    }

    const versionMetadata = versionData.metadata || {};
    const fullMetadata = {
        ...versionMetadata,
        event_id: versionData.event_id,
        model: versionData.model_name,
        provider: versionData.model_provider,
        timestamp: versionData.created_at
    };
    
    currentData = {
        user_prompt: versionData.user_prompt,
        user_images: versionData.image_urls || [],
        assistant_response: versionData.assistant_response,
        metadata: fullMetadata,
        current_version_id: versionData.version_id,
        current_provider: versionData.model_provider,
        current_model: versionData.model_name,
        current_prompt: versionData.user_prompt
    };
    
    displayMetadata(fullMetadata);

    const providerSelect = document.getElementById('provider-select');
    const modelSelect = document.getElementById('model-select');
    
    if (versionData.model_provider && providerSelect && modelSelect) {
        providerSelect.value = versionData.model_provider;
        updateModelSelect();
        
        setTimeout(() => {
            if (versionData.model_name && modelSelect) {
                modelSelect.value = versionData.model_name;
            }
        }, 100);
    }

        // Load existing rating if available
        if (versionData.rating) {
            const ratingData = typeof versionData.rating === 'object' ? versionData.rating : {overall: versionData.rating};
            
            const overallRating = document.getElementById('overall-rating');
            const reviewText = document.getElementById('rating-review');
            
            if (overallRating && ratingData.overall) {
                overallRating.value = ratingData.overall;
            }
            if (reviewText && ratingData.review) {
                reviewText.value = ratingData.review;
            }
            
            // Load parameter ratings
            if (ratingData.parameters) {
                Object.keys(ratingData.parameters).forEach(paramName => {
                    const input = document.querySelector(`.param-rating-input[data-param="${escapeHtml(paramName)}"]`);
                    if (input) {
                        input.value = ratingData.parameters[paramName];
                    }
                });
            }
        }

    console.log(`Loaded version ${versionData.version_id} into panels`);
}

function switchToListView() {
    const listBtn = document.getElementById('list-view-btn');
    const tableBtn = document.getElementById('table-view-btn');
    const versionsList = document.getElementById('versions-list');
    const comparisonContainer = document.getElementById('comparison-table-container');
    
    if (listBtn) listBtn.classList.add('active');
    if (tableBtn) tableBtn.classList.remove('active');
    if (versionsList) versionsList.style.display = 'block';
    if (comparisonContainer) comparisonContainer.classList.remove('active');
}

function switchToTableView() {
    const listBtn = document.getElementById('list-view-btn');
    const tableBtn = document.getElementById('table-view-btn');
    const versionsList = document.getElementById('versions-list');
    const comparisonContainer = document.getElementById('comparison-table-container');
    
    if (listBtn) listBtn.classList.remove('active');
    if (tableBtn) tableBtn.classList.add('active');
    if (versionsList) versionsList.style.display = 'none';
    if (comparisonContainer) comparisonContainer.classList.add('active');
    updateComparisonTable();
}

function updateComparisonTable() {
    const container = document.getElementById('comparison-table-wrapper');
    if (!container) return;
    
    const checkboxes = document.querySelectorAll('.version-checkbox:checked');
    const selectedVersionIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-version-id'));
    
    if (selectedVersionIds.length === 0) {
        container.innerHTML = '<div class="no-selection-message">Select versions using checkboxes to compare</div>';
        return;
    }

    const selectedVersions = window.allVersions.filter(v => selectedVersionIds.includes(v.version_id));
    
    window.selectedVersionsData = selectedVersions.map((v, idx) => {
        let responseText = '';
        let isObject = false;
        
        if (v.assistant_response) {
            if (typeof v.assistant_response === 'string') {
                responseText = v.assistant_response;
            } else {
                responseText = JSON.stringify(v.assistant_response, null, 2);
                isObject = true;
            }
        } else {
            responseText = 'N/A';
        }
        
        return {
            prompt: v.user_prompt || '',
            response: responseText,
            isObject: isObject
        };
    });
    
    let html = '<table class="comparison-table">';
    
    html += '<thead><tr>';
    html += '<th>Metric</th>';
    selectedVersions.forEach((version, index) => {
        const isInitial = version.version_id.endsWith('_initial');
        html += `<th class="comparison-version-header">${isInitial ? 'INITIAL' : `V${index + 1}`}</th>`;
    });
    html += '</tr></thead>';
    
    html += '<tbody>';
    
    html += '<tr><td><strong>Model</strong></td>';
    selectedVersions.forEach(version => {
        html += `<td class="comparison-value">${escapeHtml(version.model_provider)}/${escapeHtml(version.model_name)}</td>`;
    });
    html += '</tr>';
    
    html += '<tr><td><strong>Rating</strong></td>';
    selectedVersions.forEach(version => {
        const ratingDisplay = version.rating ? 
            (typeof version.rating === 'object' && version.rating.overall ? `${version.rating.overall}/10` : 
             (typeof version.rating === 'number' ? `${version.rating}/10` : 'Rated')) : 'N/A';
        html += `<td class="comparison-value">${ratingDisplay}</td>`;
    });
    html += '</tr>';
    
    html += '<tr><td><strong>Images</strong></td>';
    selectedVersions.forEach((version, idx) => {
        const images = version.image_urls || [];
        if (images.length > 0) {
            html += `<td class="comparison-value">`;
            images.forEach((imgUrl, imgIdx) => {
                html += `<img src="${escapeHtml(imgUrl)}" class="comparison-image" onclick="openImageModal('${escapeHtml(imgUrl)}')" alt="Image ${imgIdx + 1}" style="margin-right: 0.5rem; margin-bottom: 0.5rem;">`;
            });
            html += `</td>`;
        } else {
            html += `<td class="comparison-value">N/A</td>`;
        }
    });
    html += '</tr>';
    
    html += '<tr><td><strong>User Prompt</strong></td>';
    selectedVersions.forEach((version, idx) => {
        const prompt = version.user_prompt || '';
        if (prompt.length > 150) {
            const truncated = prompt.substring(0, 150) + '...';
            html += `<td class="comparison-value">
                <div class="comparison-text-truncated">${escapeHtml(truncated)}</div>
                <a class="read-more-link" onclick="openPromptModal(${idx})">Read more</a>
            </td>`;
        } else {
            html += `<td class="comparison-value">
                <div class="comparison-text-truncated">${escapeHtml(prompt || 'N/A')}</div>
            </td>`;
        }
    });
    html += '</tr>';
    
    selectedVersions.forEach((version, idx) => {
        const metadata = version.metadata || {};
        
        if (idx === 0) {
            html += '<tr><td><strong>Input Tokens</strong></td>';
            selectedVersions.forEach(v => {
                const m = v.metadata || {};
                html += `<td class="comparison-value">${m.input_tokens || 0}</td>`;
            });
            html += '</tr>';
            
            html += '<tr><td><strong>Output Tokens</strong></td>';
            selectedVersions.forEach(v => {
                const m = v.metadata || {};
                html += `<td class="comparison-value">${m.output_tokens || 0}</td>`;
            });
            html += '</tr>';
            
            html += '<tr><td><strong>Total Tokens</strong></td>';
            selectedVersions.forEach(v => {
                const m = v.metadata || {};
                const input = m.input_tokens || 0;
                const output = m.output_tokens || 0;
                html += `<td class="comparison-value">${input + output}</td>`;
            });
            html += '</tr>';
            
            html += '<tr><td><strong>Latency</strong></td>';
            selectedVersions.forEach(v => {
                const m = v.metadata || {};
                let latency = m.latency || 'N/A';
                if (typeof latency === 'number') {
                    latency = `${latency}s`;
                } else if (latency !== 'N/A' && !latency.toString().endsWith('s')) {
                    latency = `${latency}s`;
                }
                html += `<td class="comparison-value">${latency}</td>`;
            });
            html += '</tr>';
            
            html += '<tr><td><strong>Total Cost</strong></td>';
            selectedVersions.forEach(v => {
                const m = v.metadata || {};
                const cost = m.total_cost_usd;
                html += `<td class="comparison-value">${cost ? `$${parseFloat(cost).toFixed(6)}` : 'N/A'}</td>`;
            });
            html += '</tr>';
            
            html += '<tr><td><strong>Timestamp</strong></td>';
            selectedVersions.forEach(v => {
                const date = new Date(v.created_at).toLocaleString();
                html += `<td class="comparison-value">${escapeHtml(date)}</td>`;
            });
            html += '</tr>';
            
            html += '<tr><td><strong>Assistant Response</strong></td>';
            selectedVersions.forEach((v, idx) => {
                const data = window.selectedVersionsData[idx];
                const responseText = data.response;
                
                if (responseText.length > 150 && responseText !== 'N/A') {
                    const truncated = responseText.substring(0, 150) + '...';
                    html += `<td class="comparison-value">
                        <div class="comparison-text-truncated">${escapeHtml(truncated)}</div>
                        <a class="read-more-link" onclick="openResponseModal(${idx})">Read more</a>
                    </td>`;
                } else {
                    html += `<td class="comparison-value">
                        <div class="comparison-text-truncated">${escapeHtml(responseText)}</div>
                    </td>`;
                }
            });
            html += '</tr>';
        }
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function toggleImages() {
    const container = document.getElementById('image-container');
    if (!container) return;
    
    const btn = container.querySelector('.collapse-btn');
    
    if (container.classList.contains('collapsed')) {
        container.classList.remove('collapsed');
        if (btn) btn.textContent = 'Collapse';
    } else {
        container.classList.add('collapsed');
        if (btn) btn.textContent = 'Expand';
    }
}

