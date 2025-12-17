// Home page logic

let processingTimeout = null;
const mainInput = document.getElementById('main-input');

// Auto-process on paste
mainInput.addEventListener('paste', (e) => {
    setTimeout(() => {
        const value = mainInput.value.trim();
        if (value) {
            processInput(value);
        }
    }, 10);
});

// Auto-process on Enter key
mainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const value = mainInput.value.trim();
        if (value) {
            processInput(value);
        }
    }
});

// Auto-detect and process while typing (debounced)
mainInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    
    if (processingTimeout) {
        clearTimeout(processingTimeout);
    }
    
    if (value && (value.startsWith('{') || value.startsWith('['))) {
        processingTimeout = setTimeout(() => {
            if (isValidJSON(value)) {
                processInput(value);
            }
        }, 1000);
    }
});

async function processInput(inputValue) {
    if (!inputValue || !inputValue.trim()) {
        return;
    }

    showLoading(true);
    hideError();

    try {
        const data = await API.processInput(inputValue);
        console.log('Received data from server:', data);
        
        // Navigate based on data type
        if (data.is_chain && data.trace_id) {
            window.location.href = `/prompt-chain/${data.trace_id}`;
        } else if (data.metadata && data.metadata.event_id) {
            window.location.href = `/generation/${data.metadata.event_id}`;
        } else {
            showError('Unable to determine data type');
        }
        
        mainInput.value = '';
    } catch (error) {
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

async function loadEventsList() {
    try {
        const events = await API.getEvents();
        const eventsTbody = document.getElementById('events-tbody');
        const eventsSection = document.getElementById('events-list-section');

        if (events.length === 0) {
            eventsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 3rem; color: var(--text-secondary);"><p style="font-size: 1.1rem; margin-bottom: 0.5rem;">No saved events yet</p><p>Load an event by pasting JSON or Event ID above to get started.</p></td></tr>';
            eventsSection.classList.add('active');
            return;
        }

        eventsTbody.innerHTML = '';
        events.forEach(event => {
            const row = document.createElement('tr');
            row.style.cssText = 'cursor: pointer; transition: background-color 0.2s;';
            row.onmouseenter = () => row.style.backgroundColor = 'var(--bg-tertiary)';
            row.onmouseleave = () => row.style.backgroundColor = '';
            row.onclick = () => loadEventById(event.event_id);

            const date = new Date(event.last_updated).toLocaleString();

            row.innerHTML = `
                <td style="padding: 1rem; color: var(--text-primary); font-family: monospace; font-size: 0.9rem;">${escapeHtml(event.event_id)}</td>
                <td style="padding: 1rem; color: var(--text-secondary);">${event.version_count} version${event.version_count !== 1 ? 's' : ''}</td>
                <td style="padding: 1rem; color: var(--text-secondary);">${event.max_rating ? `${event.max_rating}/10` : '—'}</td>
                <td style="padding: 1rem; color: var(--text-secondary);">${escapeHtml(date)}</td>
            `;

            eventsTbody.appendChild(row);
        });

        eventsSection.classList.add('active');
        console.log(`Loaded ${events.length} events`);
    } catch (error) {
        console.error('Error loading events:', error);
        showError('Failed to load events');
    }
}

async function loadEventById(eventId) {
    showLoading(true);
    hideError();

    try {
        // Navigate to generation page
        window.location.href = `/generation/${eventId}`;
    } catch (error) {
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

async function loadChainsList() {
    try {
        const chains = await API.getChains();
        const chainsTbody = document.getElementById('chains-tbody');
        const chainsSection = document.getElementById('chains-list-section');

        if (!chainsTbody || !chainsSection) {
            console.error('Chains tbody or section element not found');
            return;
        }

        if (chains.length === 0) {
            chainsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-secondary);"><p style="font-size: 1.1rem; margin-bottom: 0.5rem;">No saved chains yet</p><p>Load a chain by pasting a Trace ID above to get started.</p></td></tr>';
            chainsSection.classList.add('active');
            return;
        }

        chainsTbody.innerHTML = '';
        
        // Fetch detailed version info for each chain
        for (const chain of chains) {
            try {
                const versions = await API.getChainVersions(chain.trace_id);
                
                const row = document.createElement('tr');
                row.style.cssText = 'cursor: pointer; transition: background-color 0.2s;';
                row.onmouseenter = () => row.style.backgroundColor = 'var(--bg-tertiary)';
                row.onmouseleave = () => row.style.backgroundColor = '';
                row.onclick = () => loadChainById(chain.trace_id);

                const date = new Date(chain.last_updated).toLocaleString();
                
                // Get step count from first version
                const stepCount = versions.length > 0 && versions[0].chain_events ? versions[0].chain_events.length : 0;
                
                // Build ratings display
                const ratingsHTML = buildChainRatingsDisplay(versions);

                row.innerHTML = `
                    <td style="padding: 1rem; color: var(--text-primary); font-weight: 500;">${escapeHtml(chain.chain_name || 'Unnamed Chain')}</td>
                    <td style="padding: 1rem; color: var(--text-secondary); font-family: monospace; font-size: 0.85rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(chain.trace_id)}">${escapeHtml(chain.trace_id)}</td>
                    <td style="padding: 1rem; color: var(--text-secondary);">${stepCount} step${stepCount !== 1 ? 's' : ''}</td>
                    <td style="padding: 1rem; color: var(--text-secondary);">${chain.version_count || 0} version${(chain.version_count || 0) !== 1 ? 's' : ''}</td>
                    <td style="padding: 1rem;">${ratingsHTML}</td>
                    <td style="padding: 1rem; color: var(--text-secondary);">${escapeHtml(date)}</td>
                `;

                chainsTbody.appendChild(row);
            } catch (error) {
                console.error(`Error loading details for chain ${chain.trace_id}:`, error);
                // Still show the chain row with basic info
                const row = document.createElement('tr');
                row.style.cssText = 'cursor: pointer; transition: background-color 0.2s;';
                row.onmouseenter = () => row.style.backgroundColor = 'var(--bg-tertiary)';
                row.onmouseleave = () => row.style.backgroundColor = '';
                row.onclick = () => loadChainById(chain.trace_id);

                const date = new Date(chain.last_updated).toLocaleString();

                row.innerHTML = `
                    <td style="padding: 1rem; color: var(--text-primary); font-weight: 500;">${escapeHtml(chain.chain_name || 'Unnamed Chain')}</td>
                    <td style="padding: 1rem; color: var(--text-secondary); font-family: monospace; font-size: 0.85rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(chain.trace_id)}">${escapeHtml(chain.trace_id)}</td>
                    <td style="padding: 1rem; color: var(--text-secondary);">—</td>
                    <td style="padding: 1rem; color: var(--text-secondary);">${chain.version_count || 0} version${(chain.version_count || 0) !== 1 ? 's' : ''}</td>
                    <td style="padding: 1rem; color: var(--text-secondary);">—</td>
                    <td style="padding: 1rem; color: var(--text-secondary);">${escapeHtml(date)}</td>
                `;

                chainsTbody.appendChild(row);
            }
        }

        chainsSection.classList.add('active');
        console.log(`Loaded ${chains.length} chains`);
    } catch (error) {
        console.error('Error loading chains:', error);
        const chainsTbody = document.getElementById('chains-tbody');
        if (chainsTbody) {
            chainsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 3rem; color: #dc2626;"><p style="font-size: 1.1rem; margin-bottom: 0.5rem;">Error loading chains</p><p style="font-size: 0.9rem;">' + escapeHtml(error.message) + '</p></td></tr>';
        }
        showError('Failed to load chains: ' + error.message);
    }
}

function buildChainRatingsDisplay(versions) {
    if (!versions || versions.length === 0) {
        return '<span style="color: var(--text-secondary);">—</span>';
    }
    
    // Collect all ratings from all versions
    const allRatings = [];
    
    versions.forEach((version, versionIdx) => {
        if (!version.chain_events || !Array.isArray(version.chain_events)) return;
        
        version.chain_events.forEach((event, stepIdx) => {
            if (event.rating) {
                const rating = typeof event.rating === 'object' ? event.rating : {overall: event.rating};
                
                allRatings.push({
                    versionIdx: versionIdx,
                    versionId: version.version_id,
                    stepIdx: stepIdx,
                    rating: rating
                });
            }
        });
    });
    
    if (allRatings.length === 0) {
        return '<span style="color: var(--text-secondary);">No ratings yet</span>';
    }
    
    // Group by step index
    const ratingsByStep = {};
    allRatings.forEach(item => {
        if (!ratingsByStep[item.stepIdx]) {
            ratingsByStep[item.stepIdx] = [];
        }
        ratingsByStep[item.stepIdx].push(item);
    });
    
    // Build display
    const stepsHTML = Object.keys(ratingsByStep).sort((a, b) => parseInt(a) - parseInt(b)).map(stepIdx => {
        const stepRatings = ratingsByStep[stepIdx];
        const stepNum = parseInt(stepIdx) + 1;
        
        // Find max overall rating for this step
        let maxOverall = null;
        stepRatings.forEach(item => {
            const overall = item.rating.overall;
            if (overall && (maxOverall === null || overall > maxOverall)) {
                maxOverall = overall;
            }
        });
        
        // Count how many versions have ratings for this step
        const ratingCount = stepRatings.length;
        
        // Build parameter ratings summary
        const parameterRatings = {};
        stepRatings.forEach(item => {
            if (item.rating.parameters) {
                Object.keys(item.rating.parameters).forEach(paramName => {
                    if (!parameterRatings[paramName]) {
                        parameterRatings[paramName] = [];
                    }
                    parameterRatings[paramName].push(item.rating.parameters[paramName]);
                });
            }
        });
        
        let detailsHTML = '';
        if (Object.keys(parameterRatings).length > 0) {
            const paramsList = Object.keys(parameterRatings).map(paramName => {
                const ratings = parameterRatings[paramName];
                const maxRating = Math.max(...ratings);
                return `${escapeHtml(paramName)}: ${maxRating}/10`;
            }).join(', ');
            detailsHTML = `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">${paramsList}</div>`;
        }
        
        const overallDisplay = maxOverall !== null ? `${maxOverall}/10` : '—';
        
        return `
            <div style="margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="color: var(--text-primary); font-weight: 500; font-size: 0.85rem;">Step ${stepNum}:</span>
                    <span style="color: var(--accent-color); font-weight: 600;">${overallDisplay}</span>
                    <span style="color: var(--text-secondary); font-size: 0.8rem;">(${ratingCount} ver${ratingCount > 1 ? 's' : ''})</span>
                </div>
                ${detailsHTML}
            </div>
        `;
    }).join('');
    
    return `<div style="font-size: 0.9rem;">${stepsHTML}</div>`;
}

async function loadChainById(traceId) {
    showLoading(true);
    hideError();

    try {
        // Navigate to chain page
        window.location.href = `/prompt-chain/${traceId}`;
    } catch (error) {
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

