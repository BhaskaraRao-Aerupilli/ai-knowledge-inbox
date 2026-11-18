import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

api.interceptors.response.use(
  (response) => {
    // If the API returns our standard envelope { success: true, data: ... }
    if (response.data && response.data.success !== undefined) {
      return response.data;
    }
    return { success: true, data: response.data };
  },
  (error) => {
    const errorData = error.response?.data?.error || {
      code: 'NETWORK_ERROR',
      message: error.message || 'Failed to communicate with server',
    };
    return Promise.reject(errorData);
  }
);

export async function fetchItems(limit = 50, offset = 0) {
  const res = await api.get(`/items?limit=${limit}&offset=${offset}`);
  return res.data;
}

export async function fetchItemById(id) {
  const res = await api.get(`/items/${id}`);
  return res.data;
}

export async function ingestNote({ title, content }) {
  const res = await api.post('/ingest', {
    source_type: 'note',
    title: title?.trim() || undefined,
    content: content.trim(),
  });
  return res.data;
}

export async function ingestUrl({ title, url }) {
  const res = await api.post('/ingest', {
    source_type: 'url',
    title: title?.trim() || undefined,
    url: url.trim(),
  });
  return res.data;
}

export async function deleteItem(id) {
  const res = await api.delete(`/items/${id}`);
  return res.data;
}

export async function askQuestion(question) {
  const res = await api.post('/query', {
    question: question.trim(),
  });
  return res.data;
}

export async function checkHealth() {
  const res = await api.get('/health');
  return res.data;
}

export default api;
