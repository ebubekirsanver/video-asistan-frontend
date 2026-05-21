import axios from 'axios';
import { getToken } from './auth';
import Constants from 'expo-constants';

const BASE_URL =
  Constants.expoConfig?.extra?.apiUrl || 'http://192.168.0.118:8010';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 120000, // 120 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every request
api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- NOTE: Auth is handled locally (services/auth.ts) ---
// The backend has NO /api/auth/* endpoints.
// The original web app uses localStorage for registration/login.
// Mobile app mirrors this with AsyncStorage + SecureStore.

// --- Video Processing (SSE Stream via fetch) ---

export const processVideo = async (
  url: string,
  message: string,
  onChunk: (text: string) => void,
  options?: {
    subjectType?: string;
    summaryLength?: string;
    questionCount?: number;
    questionDifficulty?: string;
    userTitle?: string;
  }
): Promise<void> => {
  const token = await getToken();

  const response = await fetch(`${BASE_URL}/api/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      url,
      message,
      ...options,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('ReadableStream desteklenmiyor');
  }

  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content) {
            onChunk(data.content);
          }
        } catch {
          // Partial JSON; skip
        }
      }
    }
  }
};

// --- Video Analysis (Backend's actual endpoint) ---

export const analyzeVideo = async (
  youtubeUrl: string,
  options?: {
    userTitle?: string;
    summaryLength?: string;
    questionCount?: number;
    questionDifficulty?: string;
    subjectType?: string;
  }
) => {
  const response = await api.post('/api/analyze', {
    youtube_url: youtubeUrl,
    user_title: options?.userTitle,
    summary_length: options?.summaryLength,
    question_count: options?.questionCount,
    question_difficulty: options?.questionDifficulty,
    subject_type: options?.subjectType,
  });
  return response.data;
};

// --- Chat ---

export const chatWithVideo = async (
  analysisId: string,
  youtubeUrl: string,
  question: string
) => {
  const response = await api.post('/api/chat', {
    analysis_id: analysisId,
    youtube_url: youtubeUrl,
    question,
  });
  return response.data;
};

// --- History ---

export const getHistory = async () => {
  const response = await api.get('/api/history');
  return response.data;
};

// --- Notes (local storage, backend has no /api/notes) ---
// We'll use AsyncStorage since the backend lacks these endpoints too.

import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTES_STORAGE_KEY = 'edua_notes';

interface Note {
  id: string;
  content: string;
  videoUrl: string;
  created_at: string;
}

export const getNotes = async (): Promise<Note[]> => {
  try {
    const data = await AsyncStorage.getItem(NOTES_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveNote = async (
  content: string,
  videoUrl: string
): Promise<Note> => {
  const notes = await getNotes();
  const newNote: Note = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    content,
    videoUrl,
    created_at: new Date().toISOString(),
  };
  notes.unshift(newNote);
  await AsyncStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  return newNote;
};

export const deleteNote = async (noteId: string): Promise<void> => {
  const notes = await getNotes();
  const filtered = notes.filter((n) => n.id !== noteId);
  await AsyncStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(filtered));
};

// --- Recommendations ---

export const getRecommendations = async () => {
  const response = await api.post('/api/recommendations', {});
  return response.data;
};

// --- Feedback ---

export const sendFeedback = async (title: string, action: 'like' | 'dislike' | 'remove') => {
  const response = await api.post('/api/feedback', { title, action });
  return response.data;
};

// --- Generate Questions ---

export const generateQuestions = async (
  analysisId: string,
  youtubeUrl: string,
  options?: {
    questionCount?: number;
    questionDifficulty?: string;
  }
) => {
  const response = await api.post('/api/questions', {
    analysis_id: analysisId,
    youtube_url: youtubeUrl,
    question_count: options?.questionCount,
    question_difficulty: options?.questionDifficulty,
  });
  return response.data;
};

export { BASE_URL };


