// API calls - all fetch functions

const API = {
    async processInput(input) {
        const response = await fetch('/api/process-input', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ input })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to process input');
        }
        return await response.json();
    },

    async regenerate(data) {
        const response = await fetch('/api/regenerate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to regenerate');
        }
        return await response.json();
    },

    async regenerateChain(data) {
        const response = await fetch('/api/regenerate-chain', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to regenerate chain');
        }
        return await response.json();
    },

    async saveVersion(data) {
        const response = await fetch('/api/save-version', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to save version');
        }
        return await response.json();
    },

    async saveChainVersion(data) {
        const response = await fetch('/api/save-chain-version', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to save chain version');
        }
        return await response.json();
    },

    async getModels() {
        const response = await fetch('/api/models');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    },

    async getEvents() {
        const response = await fetch('/api/events');
        if (!response.ok) {
            throw new Error('Failed to load events');
        }
        const data = await response.json();
        return data.events || [];
    },

    async getChains() {
        const response = await fetch('/api/chains');
        if (!response.ok) {
            throw new Error('Failed to load chains');
        }
        const data = await response.json();
        return data.chains || [];
    },

    async getVersions(eventId) {
        const response = await fetch(`/api/versions/${eventId}`);
        if (!response.ok) {
            throw new Error('Failed to load versions');
        }
        const data = await response.json();
        return data.versions || [];
    },

    async getChainVersions(traceId) {
        const response = await fetch(`/api/chain-versions/${traceId}`);
        if (!response.ok) {
            throw new Error('Failed to load chain versions');
        }
        const data = await response.json();
        return data.versions || [];
    },

    async updateRating(versionId, rating) {
        const response = await fetch('/api/update-rating', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ version_id: versionId, rating })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to update rating');
        }
        return await response.json();
    },

    async updateChainRating(versionId, rating) {
        const response = await fetch('/api/update-chain-rating', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ version_id: versionId, rating })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to update chain rating');
        }
        return await response.json();
    },

    async updateChainStepRating(data) {
        const response = await fetch('/api/update-chain-step-rating', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to update step rating');
        }
        return await response.json();
    },

    async deleteEvent(eventId) {
        const response = await fetch(`/api/events/${eventId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to delete event');
        }
        return await response.json();
    },

    async deleteChain(traceId) {
        const response = await fetch(`/api/chains/${traceId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to delete chain');
        }
        return await response.json();
    }
};

