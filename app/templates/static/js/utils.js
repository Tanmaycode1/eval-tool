// Utility functions

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function isValidJSON(str) {
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}

function isTraceId(str) {
    // Trace ID format: UUID_timestamp_UUID
    // Supports two timestamp formats:
    // 1. ISO 8601: YYYY-MM-DDTHH:MM:SS.mmmZ
    // 2. Unix timestamp (milliseconds): 13 digits
    const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    const isoPattern = new RegExp(`^${uuidPattern}_\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z_${uuidPattern}$`, 'i');
    const unixPattern = new RegExp(`^${uuidPattern}_\\d{13}_${uuidPattern}$`, 'i');
    return isoPattern.test(str) || unixPattern.test(str);
}

function isEventId(str) {
    // Event ID format: UUID
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function getValueClass(value) {
    if (typeof value === 'number') {
        return 'table-value-number';
    } else if (typeof value === 'boolean') {
        return 'table-value-boolean';
    }
    return 'table-value';
}

function renderJSONAsTable(obj) {
    if (!obj || typeof obj !== 'object') {
        return '<div class="table-value">' + escapeHtml(String(obj)) + '</div>';
    }

    let html = '<table class="response-table">';
    
    for (const [key, value] of Object.entries(obj)) {
        html += '<tr>';
        html += `<td class="table-key">${escapeHtml(key)}</td>`;
        html += '<td class="table-value">';
        
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
            html += renderJSONAsTable(value);
        } else {
            const valueClass = getValueClass(value);
            html += `<span class="${valueClass}">${escapeHtml(String(value))}</span>`;
        }
        
        html += '</td>';
        html += '</tr>';
    }
    
    html += '</table>';
    return html;
}

function renderArrayAsTable(array) {
    if (array.length === 0) return '';
    
    const keys = Object.keys(array[0]);
    
    let html = '<table class="nested-table">';
    
    html += '<thead><tr>';
    keys.forEach(key => {
        html += `<th>${escapeHtml(key)}</th>`;
    });
    html += '</tr></thead>';
    
    html += '<tbody>';
    array.forEach((item, index) => {
        html += '<tr>';
        keys.forEach(key => {
            const val = item[key];
            const valueClass = getValueClass(val);
            html += `<td><span class="${valueClass}">${escapeHtml(String(val !== null && val !== undefined ? val : ''))}</span></td>`;
        });
        html += '</tr>';
    });
    html += '</tbody>';
    
    html += '</table>';
    return html;
}

/**
 * Strip markdown code blocks from response text
 * Removes ```json, ```, and other code block markers
 */
function stripMarkdownCodeBlocks(text) {
    if (typeof text !== 'string') {
        return text;
    }
    
    let cleaned = text.trim();
    
    // Remove ```json at the start
    cleaned = cleaned.replace(/^```json\s*/i, '');
    // Remove ``` at the start (generic code block)
    cleaned = cleaned.replace(/^```\s*/, '');
    // Remove ``` at the end
    cleaned = cleaned.replace(/\s*```$/g, '');
    
    return cleaned.trim();
}

/**
 * Process assistant response - strip markdown code blocks and parse if needed
 */
function processAssistantResponse(response) {
    if (!response) {
        return response;
    }
    
    // If it's already an object, return as-is
    if (typeof response === 'object' && !Array.isArray(response)) {
        return response;
    }
    
    // If it's a string, strip markdown code blocks
    if (typeof response === 'string') {
        const cleaned = stripMarkdownCodeBlocks(response);
        
        // Try to parse as JSON if it looks like JSON
        if (cleaned.trim().startsWith('{') || cleaned.trim().startsWith('[')) {
            try {
                return JSON.parse(cleaned);
            } catch (e) {
                // If parsing fails, return the cleaned string
                return cleaned;
            }
        }
        
        return cleaned;
    }
    
    // For arrays, process each item if it's a string
    if (Array.isArray(response)) {
        return response.map(item => {
            if (typeof item === 'string') {
                return stripMarkdownCodeBlocks(item);
            }
            return item;
        });
    }
    
    return response;
}

function syntaxHighlight(json) {
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

