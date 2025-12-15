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
            chainsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-secondary);"><p style="font-size: 1.1rem; margin-bottom: 0.5rem;">No saved chains yet</p><p>Load a chain by pasting a Trace ID above to get started.</p></td></tr>';
            chainsSection.classList.add('active');
            return;
        }

        chainsTbody.innerHTML = '';
        chains.forEach(chain => {
            const row = document.createElement('tr');
            row.style.cssText = 'cursor: pointer; transition: background-color 0.2s;';
            row.onmouseenter = () => row.style.backgroundColor = 'var(--bg-tertiary)';
            row.onmouseleave = () => row.style.backgroundColor = '';
            row.onclick = () => loadChainById(chain.trace_id);

            const date = new Date(chain.last_updated).toLocaleString();

            row.innerHTML = `
                <td style="padding: 1rem; color: var(--text-primary); font-weight: 500;">${escapeHtml(chain.chain_name || 'Unnamed Chain')}</td>
                <td style="padding: 1rem; color: var(--text-secondary); font-family: monospace; font-size: 0.85rem; word-break: break-all;">${escapeHtml(chain.trace_id)}</td>
                <td style="padding: 1rem; color: var(--text-secondary);">${chain.version_count || 0} version${(chain.version_count || 0) !== 1 ? 's' : ''}</td>
                <td style="padding: 1rem; color: var(--text-secondary);">${chain.max_rating ? `${chain.max_rating}/10` : '—'}</td>
                <td style="padding: 1rem; color: var(--text-secondary);">${escapeHtml(date)}</td>
            `;

            chainsTbody.appendChild(row);
        });

        chainsSection.classList.add('active');
        console.log(`Loaded ${chains.length} chains`);
    } catch (error) {
        console.error('Error loading chains:', error);
        const chainsTbody = document.getElementById('chains-tbody');
        if (chainsTbody) {
            chainsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 3rem; color: #dc2626;"><p style="font-size: 1.1rem; margin-bottom: 0.5rem;">Error loading chains</p><p style="font-size: 0.9rem;">' + escapeHtml(error.message) + '</p></td></tr>';
        }
        showError('Failed to load chains: ' + error.message);
    }
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

